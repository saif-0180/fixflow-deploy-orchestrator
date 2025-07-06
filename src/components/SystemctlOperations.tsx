import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import VMSelector from './VMSelector';
import LogDisplay from './LogDisplay';
import { useAuth } from '@/contexts/AuthContext';

const SystemctlOperations = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [selectedVMs, setSelectedVMs] = useState<string[]>([]);
  const [selectedService, setSelectedService] = useState<string>('');
  const [operation, setOperation] = useState<string>('');
  const [logs, setLogs] = useState<string[]>([]);
  const [deploymentId, setDeploymentId] = useState<string | null>(null);
  const [logStatus, setLogStatus] = useState<'idle' | 'loading' | 'running' | 'success' | 'failed' | 'completed'>('idle');
  const [apiErrorMessage, setApiErrorMessage] = useState<string>("");

  // Fetch VMs
  const { data: vms = [], isLoading: isLoadingVMs } = useQuery({
    queryKey: ['vms', 'systemctl'],
    queryFn: async () => {
      console.log("Fetching VMs for systemctl");
      setApiErrorMessage("");
      try {
        const response = await fetch('/api/inventory/vms');
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") === -1) {
          const errorText = await response.text();
          console.error(`Server returned non-JSON response: ${errorText}`);
          setApiErrorMessage("API returned HTML instead of JSON. Backend service might be unavailable.");
          return [];
        }
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Failed to fetch VMs: ${errorText}`);
          setApiErrorMessage(`Failed to fetch VMs: ${response.status} ${response.statusText}`);
          throw new Error('Failed to fetch VMs');
        }
        
        const data = await response.json();
        console.log("Received VMs data:", data);
        return data;
      } catch (error) {
        console.error(`Error in VMs fetch: ${error}`);
        if (error instanceof SyntaxError) {
          setApiErrorMessage("Server returned invalid JSON. The backend might be down or misconfigured.");
        } else {
          setApiErrorMessage(`Error fetching VMs: ${error instanceof Error ? error.message : String(error)}`);
        }
        return [];
      }
    },
    refetchOnWindowFocus: false,
  });

  // Fetch Services
  const { data: services = [], isLoading: isLoadingServices } = useQuery({
    queryKey: ['systemd-services'],
    queryFn: async () => {
      console.log("Fetching systemd services");
      setApiErrorMessage("");
      try {
        const response = await fetch('/api/inventory/systemd_services');
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") === -1) {
          const errorText = await response.text();
          console.error(`Server returned non-JSON response for services: ${errorText}`);
          setApiErrorMessage("API returned HTML instead of JSON for services. Backend service might be unavailable.");
          return [];
        }
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Failed to fetch services: ${errorText}`);
          setApiErrorMessage(`Failed to fetch services: ${response.status} ${response.statusText}`);
          throw new Error('Failed to fetch services');
        }
        
        const data = await response.json();
        console.log("Received services data:", data);
        return data;
      } catch (error) {
        console.error(`Error in services fetch: ${error}`);
        if (error instanceof SyntaxError) {
          setApiErrorMessage("Server returned invalid JSON for services. The backend might be down or misconfigured.");
        } else {
          setApiErrorMessage(`Error fetching services: ${error instanceof Error ? error.message : String(error)}`);
        }
        return [];
      }
    },
    refetchOnWindowFocus: false,
  });

  // Execute systemctl command mutation
  const executeSystemctlMutation = useMutation({
    mutationFn: async () => {
      if (!selectedService || !operation || selectedVMs.length === 0) {
        throw new Error('Missing required fields');
      }

      const response = await fetch('/api/systemctl/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          service: selectedService,
          operation,
          vms: selectedVMs,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to execute systemctl command');
      }

      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Systemctl Command Started",
        description: `Deployment ID: ${data.deploymentId}`,
      });
      setDeploymentId(data.deploymentId);
      setLogStatus('running');
      pollLogs(data.deploymentId);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : 'Failed to execute systemctl command',
        variant: "destructive",
      });
      setLogStatus('failed');
    },
  });

  // Poll logs when deployment starts
  const pollLogs = async (id: string) => {
    try {
      setLogStatus('loading');
      
      // Set up SSE for real-time logs
      const evtSource = new EventSource(`/api/deploy/${id}/logs`);
      
      evtSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.message) {
          setLogs(prev => [...prev, data.message]);
        }
        
        if (data.status && data.status !== 'running') {
          setLogStatus(data.status === 'failed' ? 'failed' : 'completed');
          evtSource.close();
        }
      };
      
      evtSource.onerror = () => {
        evtSource.close();
        // Fallback to normal polling if SSE fails
        fetchLogs(id);
      };
      
      return () => {
        evtSource.close();
      };
    } catch (error) {
      console.error('Error setting up log polling:', error);
      // Fallback to regular polling
      fetchLogs(id);
    }
  };
  
  const fetchLogs = async (id: string) => {
    try {
      const response = await fetch(`/api/deploy/${id}/logs`);
      if (!response.ok) {
        throw new Error('Failed to fetch logs');
      }
      
      const data = await response.json();
      setLogs(data.logs || []);
      
      if (data.status) {
        setLogStatus(data.status === 'failed' ? 'failed' : 'completed');
      }
      
      // Continue polling if still running
      if (data.status === 'running') {
        setTimeout(() => fetchLogs(id), 2000);
      }
    } catch (error) {
      console.error('Error fetching logs:', error);
      setLogStatus('failed');
    }
  };

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLogs([]);
    executeSystemctlMutation.mutate();
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Card className="bg-[#1a2b42] text-[#EEEEEE]">
        <CardHeader>
          <CardTitle>Systemctl Operations</CardTitle>
        </CardHeader>
        <CardContent>
          {apiErrorMessage && (
            <div className="p-4 bg-red-100 text-red-800 rounded-md mb-4">
              <p className="font-medium">API Error:</p>
              <p className="text-sm">{apiErrorMessage}</p>
            </div>
          )}
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <VMSelector
              selectedVMs={selectedVMs}
              onSelectionChange={setSelectedVMs}
              availableVMs={vms}
              isLoading={isLoadingVMs}
            />
            
            <div>
              <label htmlFor="service" className="block text-sm font-medium mb-2">
                Service
              </label>
              <Select 
                onValueChange={setSelectedService}
                disabled={isLoadingServices || services.length === 0}
              >
                <SelectTrigger id="service">
                  <SelectValue placeholder="Select Service" />
                </SelectTrigger>
                <SelectContent>
                  {services.map((service: string) => (
                    <SelectItem key={service} value={service}>{service}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label htmlFor="operation" className="block text-sm font-medium mb-2">
                Operation
              </label>
              <Select onValueChange={setOperation}>
                <SelectTrigger id="operation">
                  <SelectValue placeholder="Select Operation" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="start">Start</SelectItem>
                  <SelectItem value="stop">Stop</SelectItem>
                  <SelectItem value="restart">Restart</SelectItem>
                  <SelectItem value="status">Status</SelectItem>
                  <SelectItem value="enable">Enable</SelectItem>
                  <SelectItem value="disable">Disable</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <Button 
              type="submit" 
              disabled={!selectedService || !operation || selectedVMs.length === 0 || executeSystemctlMutation.isPending}
              className="w-full"
            >
              {executeSystemctlMutation.isPending ? 'Executing...' : 'Execute Command'}
            </Button>
          </form>
        </CardContent>
      </Card>
      
      <LogDisplay 
        logs={logs} 
        title={`Systemctl Execution Logs${user?.username ? ` - User: ${user.username}` : ''}`}
        height="400px"
        status={logStatus}
      />
    </div>
  );
};

export default SystemctlOperations;
