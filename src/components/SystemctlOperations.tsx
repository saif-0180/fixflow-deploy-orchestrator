import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import VMSelector from '@/components/VMSelector';
import LogDisplay from '@/components/LogDisplay';
import { Loader2 } from 'lucide-react';

const SystemctlOperations: React.FC = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [operation, setOperation] = useState<'start' | 'stop' | 'restart' | 'status'>('status');
  const [serviceName, setServiceName] = useState<string>('');
  const [selectedVMs, setSelectedVMs] = useState<string>('');
  const [deploymentLogs, setDeploymentLogs] = useState<string[]>([]);
  const [logStatus, setLogStatus] = useState<'idle' | 'loading' | 'running' | 'success' | 'failed' | 'completed'>('idle');

  // Fetch VMs
  const { data: vms = [] } = useQuery({
    queryKey: ['vms'],
    queryFn: async () => {
      const response = await fetch('/api/vms');
      if (!response.ok) {
        throw new Error('Failed to fetch VMs');
      }
      return response.json();
    },
  });

  // Execute systemctl operation
  const systemctlMutation = useMutation({
    mutationFn: async (data: { operation: string; service: string; vms: string[] }) => {
      const response = await fetch('/api/systemd/status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Systemctl operation failed: ${errorText}`);
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      if (data.deploymentId) {
        setLogStatus('running');
        pollForLogs(data.deploymentId);
        toast({
          title: "Operation Started",
          description: `Systemctl ${operation} operation initiated for service: ${serviceName}`,
        });
      }
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Systemctl operation failed",
        variant: "destructive",
      });
      setLogStatus('failed');
    },
  });

  // Poll for operation logs
  const pollForLogs = (deploymentId: string) => {
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/deploy/${deploymentId}/logs`);
        if (response.ok) {
          const data = await response.json();
          setDeploymentLogs(data.logs || []);
          
          if (data.status && data.status !== 'running') {
            setLogStatus(data.status === 'success' ? 'success' : 'failed');
            clearInterval(pollInterval);
          }
        }
      } catch (error) {
        console.error('Error polling logs:', error);
      }
    }, 2000);
    
    setTimeout(() => clearInterval(pollInterval), 300000);
  };

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!serviceName.trim()) {
      toast({
        title: "Error",
        description: "Please enter a service name",
        variant: "destructive",
      });
      return;
    }
    
    if (!selectedVMs) {
      toast({
        title: "Error", 
        description: "Please select at least one VM",
        variant: "destructive",
      });
      return;
    }
    
    const vmList = selectedVMs.split(',').map(vm => vm.trim()).filter(vm => vm);
    
    setDeploymentLogs([]);
    setLogStatus('loading');
    
    systemctlMutation.mutate({
      operation,
      service: serviceName,
      vms: vmList
    });
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-[#F79B72] mb-4">Systemctl Operations</h2>
      
      <Card className="bg-[#EEEEEE]">
        <CardHeader>
          <CardTitle className="text-[#F79B72]">Service Management</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="operation" className="text-[#2A4759]">Operation</Label>
                <Select value={operation} onValueChange={(value: 'start' | 'stop' | 'restart' | 'status') => setOperation(value)}>
                  <SelectTrigger className="bg-[#EEEEEE] border-[#2A4759] text-[#2A4759]">
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
              
              <div className="space-y-2">
                <Label htmlFor="service" className="text-[#2A4759]">Service Name</Label>
                <input
                  id="service"
                  type="text"
                  value={serviceName}
                  onChange={(e) => setServiceName(e.target.value)}
                  placeholder="e.g., nginx, apache2, mysql"
                  className="w-full px-3 py-2 border border-[#2A4759] rounded-md bg-[#EEEEEE] text-[#2A4759] placeholder-[#2A4759]/50"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label className="text-[#2A4759]">Target VMs</Label>
              <VMSelector 
                vms={vms} 
                onSelectionChange={setSelectedVMs}
                value={selectedVMs}
              />
            </div>
            
            <Button 
              type="submit" 
              disabled={systemctlMutation.isPending}
              className="bg-[#F79B72] text-[#2A4759] hover:bg-[#F79B72]/80"
            >
              {systemctlMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Executing...
                </>
              ) : (
                `Execute ${operation.charAt(0).toUpperCase() + operation.slice(1)}`
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
      
      <LogDisplay 
        logs={deploymentLogs} 
        height="400px" 
        title={`Systemctl ${operation} - ${serviceName || 'Service'}`}
        status={logStatus}
      />
    </div>
  );
};

export default SystemctlOperations;
