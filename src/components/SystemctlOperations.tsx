
import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ListChecks, Play, RefreshCw, Loader2 } from 'lucide-react';
import LogDisplay from '@/components/LogDisplay';
import { useAuth } from '@/contexts/AuthContext';

interface VM {
  name: string;
  type: string;
  ip: string;
}

interface SystemctlStatus {
  status: 'idle' | 'loading' | 'running' | 'success' | 'failed' | 'completed';
  logs: string[];
}

const SystemctlOperations: React.FC = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [selectedVms, setSelectedVms] = useState<string[]>([]);
  const [operation, setOperation] = useState<string>('start');
  const [service, setService] = useState<string>('');
  const [logs, setLogs] = useState<string[]>([]);
  const [logStatus, setLogStatus] = useState<'idle' | 'loading' | 'running' | 'success' | 'failed' | 'completed'>('idle');
  const [lastRefreshedTime, setLastRefreshedTime] = useState<string>(new Date().toLocaleTimeString());
  const [apiErrorMessage, setApiErrorMessage] = useState<string>("");

  // Fetch VMs from inventory
  const { data: vms, isLoading: isLoadingVms, isError: isErrorVms } = useQuery({
    queryKey: ['vms'],
    queryFn: async () => {
      setApiErrorMessage(""); // Clear any previous errors
      try {
        const response = await fetch('/api/inventory/vms');
        // Add explicit error handling for non-JSON responses
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") === -1) {
          const errorText = await response.text();
          console.error(`Server returned non-JSON response: ${errorText}`);
          setApiErrorMessage("API returned HTML instead of JSON. Backend service might be unavailable.");
          return [];
        }
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Failed to fetch vms: ${errorText}`);
          setApiErrorMessage(`Failed to fetch vms: ${response.status} ${response.statusText}`);
          throw new Error('Failed to fetch vms');
        }
        
        const data = await response.json();
        console.log("Received vms data:", data);
        setLastRefreshedTime(new Date().toLocaleTimeString());
        return data as VM[];
      } catch (error) {
        console.error(`Error in vms fetch: ${error}`);
        if (error instanceof SyntaxError) {
          setApiErrorMessage("Server returned invalid JSON. The backend might be down or misconfigured.");
        } else {
          setApiErrorMessage(`Error fetching vms: ${error instanceof Error ? error.message : String(error)}`);
        }
        return []; // Return empty array instead of throwing to avoid UI errors
      }
    },
    staleTime: 300000, // 5 minutes - consider data fresh for 5 minutes
    refetchInterval: 1800000, // Refetch every 30 minutes
    refetchOnWindowFocus: false, // Don't refetch on window focus
    retry: 2,
  });

  // Fetch systemd services from inventory
  const { data: services, isLoading: isLoadingServices, isError: isErrorServices } = useQuery({
    queryKey: ['systemd-services'],
    queryFn: async () => {
      setApiErrorMessage(""); // Clear any previous errors
      try {
        const response = await fetch('/api/inventory/systemd_services');
        // Add explicit error handling for non-JSON responses
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") === -1) {
          const errorText = await response.text();
          console.error(`Server returned non-JSON response: ${errorText}`);
          setApiErrorMessage("API returned HTML instead of JSON. Backend service might be unavailable.");
          return [];
        }
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Failed to fetch systemd_services: ${errorText}`);
          setApiErrorMessage(`Failed to fetch systemd_services: ${response.status} ${response.statusText}`);
          throw new Error('Failed to fetch systemd_services');
        }
        
        const data = await response.json();
        console.log("Received systemd_services data:", data);
        setLastRefreshedTime(new Date().toLocaleTimeString());
        return data as string[];
      } catch (error) {
        console.error(`Error in systemd_services fetch: ${error}`);
        if (error instanceof SyntaxError) {
          setApiErrorMessage("Server returned invalid JSON. The backend might be down or misconfigured.");
        } else {
          setApiErrorMessage(`Error fetching systemd_services: ${error instanceof Error ? error.message : String(error)}`);
        }
        return []; // Return empty array instead of throwing to avoid UI errors
      }
    },
    staleTime: 300000, // 5 minutes - consider data fresh for 5 minutes
    refetchInterval: 1800000, // Refetch every 30 minutes
    refetchOnWindowFocus: false, // Don't refetch on window focus
    retry: 2,
  });

  const executeSystemctl = async (operation: string, service: string, selectedVms: string[]) => {
    if (!service.trim()) {
      toast({
        title: "Error",
        description: "Service name is required",
        variant: "destructive",
      });
      return;
    }

    if (selectedVms.length === 0) {
      toast({
        title: "Error",
        description: "At least one VM must be selected",
        variant: "destructive",
      });
      return;
    }

    setLogs([]);
    setLogStatus('loading');

    try {
      const vmIps = vms?.filter(vm => selectedVms.includes(vm.name)).map(vm => vm.ip);
      const token = localStorage.getItem('authToken');
      const response = await fetch('/api/systemctl/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          operation: operation,
          service: service,
          vms: vmIps,
          logged_in_user: user?.username
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to execute systemctl command');
      }

      const data = await response.json();
      setLogs(data.logs || []);
      setLogStatus(data.status === 'running' ? 'running' : 'completed');

      const timeoutId = setTimeout(() => {
        if (logStatus === 'running') {
          setLogStatus('failed'); // Changed from 'timeout' to 'failed'
          setLogs(prev => [...prev, 'Operation timed out after 5 minutes']);
        }
      }, 300000);

      const logUpdateInterval = setInterval(async () => {
        try {
          const logResponse = await fetch(`/api/deploy/${data.deploymentId}/logs`);
          if (logResponse.ok) {
            const logData = await logResponse.json();
            setLogs(logData.logs || []);
            setLogStatus(logData.status === 'running' ? 'running' : 'completed');
            if (logData.status !== 'running') {
              clearInterval(logUpdateInterval);
              clearTimeout(timeoutId);
            }
          } else {
            console.error('Failed to fetch log update:', logResponse.status);
            clearInterval(logUpdateInterval);
            clearTimeout(timeoutId);
            setLogStatus('failed');
            setLogs(prev => [...prev, 'Failed to fetch log update.']);
          }
        } catch (err) {
          console.error('Error fetching log update:', err);
          clearInterval(logUpdateInterval);
          clearTimeout(timeoutId);
          setLogStatus('failed');
          setLogs(prev => [...prev, 'Error fetching log update.']);
        }
      }, 5000);

    } catch (error: any) {
      console.error('Error executing systemctl command:', error);
      setLogStatus('failed');
      setLogs([error.message || 'Failed to execute systemctl command']);
      toast({
        title: "Error",
        description: error.message || 'Failed to execute systemctl command',
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-[#F79B72] mb-4">Systemctl Operations</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Configuration Section */}
        <Card className="bg-[#EEEEEE]">
          <CardHeader>
            <CardTitle className="text-[#F79B72]">Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* VM Selection */}
            <div>
              <Label className="text-[#2A4759]">Select VMs:</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {isLoadingVms ? (
                  <div className="flex items-center justify-center">
                    <Loader2 className="h-4 w-4 animate-spin text-[#F79B72]" />
                  </div>
                ) : (
                  vms?.map((vm) => (
                    <Button
                      key={vm.name}
                      variant={selectedVms.includes(vm.name) ? "default" : "outline"}
                      onClick={() => {
                        if (selectedVms.includes(vm.name)) {
                          setSelectedVms(selectedVms.filter((name) => name !== vm.name));
                        } else {
                          setSelectedVms([...selectedVms, vm.name]);
                        }
                      }}
                      className={`text-[#2A4759] ${selectedVms.includes(vm.name) ? 'bg-[#F79B72] hover:bg-[#F79B72]/80' : 'bg-transparent hover:bg-[#F79B72]/20'}`}
                    >
                      {vm.name}
                    </Button>
                  ))
                )}
                {apiErrorMessage && (
                  <div className="p-4 bg-red-100 text-red-800 rounded-md mb-4">
                    <p className="font-medium">API Error:</p>
                    <p className="text-sm">{apiErrorMessage}</p>
                  </div>
                )}
              </div>
            </div>
            
            {/* Operation Selection */}
            <div>
              <Label htmlFor="operation" className="text-[#2A4759]">Operation:</Label>
              <Select value={operation} onValueChange={setOperation}>
                <SelectTrigger className="bg-white border-[#2A4759] text-[#2A4759]">
                  <SelectValue placeholder="Select operation" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="start">Start</SelectItem>
                  <SelectItem value="stop">Stop</SelectItem>
                  <SelectItem value="restart">Restart</SelectItem>
                  <SelectItem value="status">Status</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {/* Service Selection */}
            <div>
              <Label htmlFor="service" className="text-[#2A4759]">Service:</Label>
              {isLoadingServices ? (
                <div className="flex items-center justify-center p-2">
                  <Loader2 className="h-4 w-4 animate-spin text-[#F79B72]" />
                </div>
              ) : (
                <Select value={service} onValueChange={setService}>
                  <SelectTrigger className="bg-white border-[#2A4759] text-[#2A4759]">
                    <SelectValue placeholder="Select service" />
                  </SelectTrigger>
                  <SelectContent>
                    {services?.map((serviceName) => (
                      <SelectItem key={serviceName} value={serviceName}>
                        {serviceName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            
            {/* Execute Button */}
            <Button
              onClick={() => executeSystemctl(operation, service, selectedVms)}
              className="bg-[#F79B72] text-[#2A4759] hover:bg-[#F79B72]/80"
              disabled={logStatus === 'loading' || logStatus === 'running'}
            >
              {logStatus === 'loading' || logStatus === 'running' ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Executing...
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  Execute
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Log Display Section */}
        <LogDisplay 
          logs={logs} 
          height="400px" 
          title="Execution Logs"
          status={logStatus}
        />
      </div>
    </div>
  );
};

export default SystemctlOperations;
