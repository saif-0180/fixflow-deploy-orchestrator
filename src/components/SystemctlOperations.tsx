
import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import VMSelector from './VMSelector';
import LogDisplay from './LogDisplay';
import { useQuery } from '@tanstack/react-query';

const SystemctlOperations = () => {
  const { toast } = useToast();
  const [selectedVMs, setSelectedVMs] = useState<string[]>([]);
  const [selectedService, setSelectedService] = useState<string>('');
  const [operation, setOperation] = useState<string>('status');
  const [logs, setLogs] = useState<string[]>([]);
  const [deploymentId, setDeploymentId] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'running' | 'success' | 'failed'>('idle');

  // Fetch systemd services
  const { data: services = [], isLoading: isLoadingServices } = useQuery({
    queryKey: ['systemd-services'],
    queryFn: async () => {
      const response = await fetch('/api/systemd/services');
      if (!response.ok) {
        throw new Error('Failed to fetch systemd services');
      }
      return response.json();
    },
    refetchOnWindowFocus: false,
  });

  // Execute systemctl operation
  const systemctlMutation = useMutation({
    mutationFn: async () => {
      if (!selectedService || selectedVMs.length === 0) {
        throw new Error('Please select a service and at least one VM');
      }

      const response = await fetch(`/api/systemd/${operation}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          service: selectedService,
          vms: selectedVMs,
          operation
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to execute systemctl operation');
      }

      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Systemctl Operation Started",
        description: `Service: ${selectedService}, Operation: ${operation}`,
      });
      setDeploymentId(data.deploymentId);
      setStatus('running');
      pollLogs(data.deploymentId);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : 'Failed to execute systemctl operation',
        variant: "destructive",
      });
    },
  });

  // Poll for operation logs
  const pollLogs = async (id: string) => {
    try {
      setStatus('loading');
      // Set up SSE for real-time logs
      const evtSource = new EventSource(`/api/deploy/${id}/logs`);
      
      evtSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.message) {
          setLogs(prev => [...prev, data.message]);
        }
        
        if (data.status && data.status !== 'running') {
          setStatus(data.status);
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
      
      if (data.logs) {
        // Filter out logs that are too noisy for systemctl operations
        const filteredLogs = data.logs.filter((log: string) => {
          // Skip certain noisy logs that don't add value
          return !log.includes('TASK [Check if service exists]') &&
                 !log.includes('ok: [') &&
                 !log.includes('PLAY [Systemd') &&
                 !log.includes('TASK [Gathering Facts]') &&
                 !log.includes('META:') &&
                 !log.includes('skipping:');
        });
        setLogs(filteredLogs);
      }
      
      if (data.status) {
        setStatus(data.status);
      }
      
      // Continue polling if still running
      if (data.status === 'running') {
        setTimeout(() => fetchLogs(id), 2000);
      }
    } catch (error) {
      console.error('Error fetching logs:', error);
      setStatus('failed');
    }
  };

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLogs([]);
    systemctlMutation.mutate();
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Card className="bg-[#1a2b42] text-[#EEEEEE]">
        <CardHeader>
          <CardTitle>Systemctl Operations</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="systemd-service">Service</Label>
              <Select 
                onValueChange={setSelectedService}
                disabled={isLoadingServices || services.length === 0}
              >
                <SelectTrigger id="systemd-service">
                  <SelectValue placeholder="Select service" />
                </SelectTrigger>
                <SelectContent>
                  {services.map((service: string) => (
                    <SelectItem key={service} value={service}>{service}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="systemd-operation">Operation</Label>
              <Select 
                onValueChange={setOperation}
                defaultValue="status"
              >
                <SelectTrigger id="systemd-operation">
                  <SelectValue placeholder="Select operation" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="status">Status</SelectItem>
                  <SelectItem value="start">Start</SelectItem>
                  <SelectItem value="stop">Stop</SelectItem>
                  <SelectItem value="restart">Restart</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label>Target VMs</Label>
              <VMSelector 
                onSelectionChange={setSelectedVMs}
                selectedVMs={selectedVMs}
              />
            </div>
            
            <Button 
              type="submit" 
              disabled={!selectedService || selectedVMs.length === 0 || systemctlMutation.isPending}
              className="w-full"
            >
              {systemctlMutation.isPending ? 'Executing...' : 'Execute Systemctl Operation'}
            </Button>
          </form>
        </CardContent>
      </Card>
      
      <LogDisplay 
        logs={logs} 
        title="Systemctl Operation Logs" 
        height="400px"
        status={status}
      />
    </div>
  );
};

export default SystemctlOperations;
