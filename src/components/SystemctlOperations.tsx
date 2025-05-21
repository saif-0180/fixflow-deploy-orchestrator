
import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from '@tanstack/react-query';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import VMSelector from '@/components/VMSelector';
import LogDisplay from '@/components/LogDisplay';

const SystemctlOperations = () => {
  const { toast } = useToast();
  const [selectedService, setSelectedService] = useState<string>("");
  const [selectedVMs, setSelectedVMs] = useState<string[]>([]);
  const [selectedOperation, setSelectedOperation] = useState<string>("status");
  const [logs, setLogs] = useState<string[]>([]);
  const [deploymentId, setDeploymentId] = useState<string | null>(null);
  const [operationStatus, setOperationStatus] = useState<'idle' | 'loading' | 'running' | 'success' | 'failed' | 'completed'>('idle');

  // Fetch systemd services
  const { data: services = [] } = useQuery({
    queryKey: ['systemd-services'],
    queryFn: async () => {
      try {
        // First try to fetch from inventory directly
        const response = await fetch('/inventory/inventory.json');
        if (!response.ok) {
          throw new Error('Failed to fetch inventory.json');
        }
        const data = await response.json();
        return data.systemd_services || [];
      } catch (error) {
        console.error('Error fetching from inventory:', error);
        // Fallback to API
        try {
          const apiResponse = await fetch('/api/systemd/services');
          if (!apiResponse.ok) {
            throw new Error('Failed to fetch systemd services from API');
          }
          return await apiResponse.json();
        } catch (apiError) {
          console.error('Error fetching from API:', apiError);
          return ['docker.service', 'kafka', 'zookeeper'];
        }
      }
    }
  });

  // Handle VM selection changes
  const handleVMSelectionChange = (vms: string[]) => {
    setSelectedVMs(vms);
  };

  // Systemctl operation mutation
  const systemctlMutation = useMutation({
    mutationFn: async () => {
      console.log(`Executing systemctl operation. Operation: ${selectedOperation}, Service: ${selectedService}`);
      setOperationStatus('loading');
      
      const response = await fetch(`/api/systemd/${selectedOperation}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          operation: selectedOperation,
          service: selectedService,
          vms: selectedVMs
        }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to execute systemctl operation: ${errorText}`);
      }
      
      const data = await response.json();
      setDeploymentId(data.deploymentId);
      setOperationStatus('running');
      return data;
    },
    onSuccess: () => {
      toast({
        title: "Systemctl Operation Started",
        description: `Systemctl ${selectedOperation} operation has been initiated.`,
      });
      
      // Poll for logs immediately
      setTimeout(() => {
        if (deploymentId) {
          fetchLogs(deploymentId);
        }
      }, 1000);
    },
    onError: (error) => {
      setOperationStatus('failed');
      toast({
        title: "Systemctl Operation Failed",
        description: error instanceof Error ? error.message : "Failed to execute systemctl operation",
        variant: "destructive",
      });
    },
  });

  // Fetch logs for a deployment
  const fetchLogs = async (id: string) => {
    if (!id) return;
    
    try {
      const response = await fetch(`/api/deploy/${id}/logs`);
      if (!response.ok) {
        throw new Error('Failed to fetch logs');
      }
      
      const data = await response.json();
      if (data && data.logs) {
        // Only show relevant logs for systemctl operations
        const relevantLogs = data.logs.filter((log: string) => 
          !log.includes('PLAY RECAP') && 
          !log.includes('TASK [Gathering Facts]') && 
          !log.includes('PLAY [Run systemd commands]') &&
          !log.includes('ok=')
        );
        
        setLogs(relevantLogs);
        
        // Update status based on response
        if (data.status === 'completed' || data.status === 'success') {
          setOperationStatus('success');
        } else if (data.status === 'failed') {
          setOperationStatus('failed');
        } else if (data.status === 'running') {
          // If still running, schedule another check
          setTimeout(() => fetchLogs(id), 2000);
        }
      }
    } catch (error) {
      console.error('Error fetching logs:', error);
      setOperationStatus('failed');
    }
  };

  // Start fetching logs when deploymentId is available
  useEffect(() => {
    if (deploymentId) {
      fetchLogs(deploymentId);
    }
  }, [deploymentId]);

  const handleExecute = () => {
    if (!selectedService) {
      toast({
        title: "Validation Error",
        description: "Please select a service.",
        variant: "destructive",
      });
      return;
    }
    
    if (selectedVMs.length === 0) {
      toast({
        title: "Validation Error",
        description: "Please select at least one VM.",
        variant: "destructive",
      });
      return;
    }

    setLogs([]);
    setOperationStatus('idle');
    systemctlMutation.mutate();
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-[#F79B72] mb-4">Systemctl Operations</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <label htmlFor="service-select" className="block text-[#F79B72] mb-2">Select Service</label>
            <Select value={selectedService} onValueChange={setSelectedService}>
              <SelectTrigger id="service-select" className="bg-[#EEEEEE] border-[#2A4759] text-[#2A4759]">
                <SelectValue placeholder="Select a service" className="text-[#2A4759]" />
              </SelectTrigger>
              <SelectContent className="bg-[#DDDDDD] border-[#2A4759] text-[#2A4759]">
                {services.map((service: string) => (
                  <SelectItem key={service} value={service} className="text-[#2A4759]">{service}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label htmlFor="operation-select" className="block text-[#F79B72] mb-2">Select Operation</label>
            <Select value={selectedOperation} onValueChange={setSelectedOperation}>
              <SelectTrigger id="operation-select" className="bg-[#EEEEEE] border-[#2A4759] text-[#2A4759]">
                <SelectValue placeholder="Select an operation" className="text-[#2A4759]" />
              </SelectTrigger>
              <SelectContent className="bg-[#DDDDDD] border-[#2A4759] text-[#2A4759]">
                <SelectItem value="status" className="text-[#2A4759]">Status</SelectItem>
                <SelectItem value="start" className="text-[#2A4759]">Start</SelectItem>
                <SelectItem value="stop" className="text-[#2A4759]">Stop</SelectItem>
                <SelectItem value="restart" className="text-[#2A4759]">Restart</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <label className="block text-[#F79B72] mb-2">Select VMs</label>
            <VMSelector onSelectionChange={handleVMSelectionChange} />
          </div>

          <Button 
            onClick={handleExecute} 
            className="bg-[#F79B72] text-[#2A4759] hover:bg-[#F79B72]/80"
            disabled={systemctlMutation.isPending || operationStatus === 'running' || operationStatus === 'loading'}
          >
            {systemctlMutation.isPending || operationStatus === 'running' || operationStatus === 'loading' ? 
              "Executing..." : "Execute Operation"}
          </Button>
        </div>

        <div className="h-full">
          <LogDisplay 
            logs={logs} 
            height="400px" 
            title="Systemctl Operation Logs" 
            fixAutoScroll={true}
            status={operationStatus} 
          />
        </div>
      </div>
    </div>
  );
};

export default SystemctlOperations;
