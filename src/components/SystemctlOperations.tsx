
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
      const response = await fetch('/api/systemd/services');
      if (!response.ok) {
        throw new Error('Failed to fetch systemd services');
      }
      return response.json();
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

  // Fetch log updates with improved completion detection
  useEffect(() => {
    if (!deploymentId) return;

    let pollingInterval: number | null = null;
    let consecutiveSameLogCount = 0;
    let previousLogLength = 0;

    // Initial logs fetch
    const fetchLogs = async () => {
      try {
        const response = await fetch(`/api/deploy/${deploymentId}/logs`);
        if (response.ok) {
          const data = await response.json();
          if (data && data.logs) {
            setLogs(data.logs);
            
            // Check if status is explicitly completed or failed
            if (data.status === 'completed' || data.status === 'success') {
              setOperationStatus('success');
              if (pollingInterval) clearTimeout(pollingInterval);
              return;
            }
            
            if (data.status === 'failed') {
              setOperationStatus('failed');
              if (pollingInterval) clearTimeout(pollingInterval);
              return;
            }
            
            // Check for implicit completion by checking if logs haven't changed for a while
            if (data.logs.length === previousLogLength) {
              consecutiveSameLogCount++;
              // If logs haven't changed for 3 consecutive checks, consider it completed
              if (consecutiveSameLogCount >= 3) {
                console.log("Operation appears to be complete (logs unchanged)");
                setOperationStatus('success');
                if (pollingInterval) clearTimeout(pollingInterval);
                return;
              }
            } else {
              consecutiveSameLogCount = 0;
              previousLogLength = data.logs.length;
            }
            
            // If not complete, schedule another fetch
            pollingInterval = window.setTimeout(fetchLogs, 3000); // Poll every 3 seconds
          }
        } else {
          console.error("Failed to fetch logs:", await response.text());
          // If we can't get logs after a few tries, stop polling
          consecutiveSameLogCount++;
          if (consecutiveSameLogCount >= 3) {
            setOperationStatus('failed');
            if (pollingInterval) clearTimeout(pollingInterval);
          } else {
            pollingInterval = window.setTimeout(fetchLogs, 3000);
          }
        }
      } catch (error) {
        console.error("Error fetching logs:", error);
        // Error handling - still try a few times
        consecutiveSameLogCount++;
        if (consecutiveSameLogCount >= 3) {
          setOperationStatus('failed');
          if (pollingInterval) clearTimeout(pollingInterval);
        } else {
          pollingInterval = window.setTimeout(fetchLogs, 3000);
        }
      }
    };
    
    fetchLogs();
    
    // Cleanup timeout on component unmount
    return () => {
      if (pollingInterval) clearTimeout(pollingInterval);
    };
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
