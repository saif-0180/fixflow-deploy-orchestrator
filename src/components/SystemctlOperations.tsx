
import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from '@tanstack/react-query';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import LogDisplay from '@/components/LogDisplay';
import VMSelector from '@/components/VMSelector';

const SystemctlOperations: React.FC = () => {
  const { toast } = useToast();
  const [selectedService, setSelectedService] = useState<string>("");
  const [selectedOperation, setSelectedOperation] = useState<string>("status");
  const [selectedVMs, setSelectedVMs] = useState<string[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [deploymentId, setDeploymentId] = useState<string | null>(null);
  const [vms, setVms] = useState<string[]>([]);

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

  // Systemctl operation mutation
  const systemctlMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/systemd/operation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          service: selectedService,
          operation: selectedOperation,
          vms: selectedVMs,
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to execute systemctl operation');
      }
      
      const data = await response.json();
      setDeploymentId(data.deploymentId);
      return data;
    },
    onSuccess: () => {
      toast({
        title: "Operation Started",
        description: `Systemctl ${selectedOperation} operation has been initiated.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Operation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Fetch log updates
  useEffect(() => {
    if (!deploymentId) return;

    const eventSource = new EventSource(`/api/deploy/${deploymentId}/logs`);
    
    eventSource.onmessage = (event) => {
      const logData = JSON.parse(event.data);
      setLogs(prev => [...prev, logData.message]);
      
      if (logData.status === 'completed' || logData.status === 'failed') {
        eventSource.close();
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [deploymentId]);

  // Add a useEffect to fetch VMs
  useEffect(() => {
    const fetchVMs = async () => {
      try {
        const response = await fetch('/api/vms');
        if (!response.ok) {
          throw new Error('Failed to fetch VMs');
        }
        const data = await response.json();
        // Extract VM names from the response
        const vmNames = data.map((vm: any) => vm.name);
        setVms(vmNames);
      } catch (error) {
        console.error('Error fetching VMs:', error);
      }
    };
    
    fetchVMs();
  }, []);

  const handleExecute = () => {
    if (!selectedService) {
      toast({
        title: "Validation Error",
        description: "Please select a service.",
        variant: "destructive",
      });
      return;
    }
    
    if (!selectedOperation) {
      toast({
        title: "Validation Error",
        description: "Please select an operation.",
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
    systemctlMutation.mutate();
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-[#F79B72] mb-4">Systemd Service Management</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4 bg-[#EEEEEE] p-4 rounded-md">
          <div>
            <Label htmlFor="service-select" className="text-[#F79B72]">Select Service</Label>
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
            <Label htmlFor="operation-select" className="text-[#F79B72]">Select Operation</Label>
            <Select value={selectedOperation} onValueChange={setSelectedOperation}>
              <SelectTrigger id="operation-select" className="bg-[#EEEEEE] border-[#2A4759] text-[#2A4759]">
                <SelectValue placeholder="Select an operation" className="text-[#2A4759]" />
              </SelectTrigger>
              <SelectContent className="bg-[#DDDDDD] border-[#2A4759] text-[#2A4759]">
                <SelectItem value="status" className="text-[#2A4759]">status</SelectItem>
                <SelectItem value="start" className="text-[#2A4759]">start</SelectItem>
                <SelectItem value="stop" className="text-[#2A4759]">stop</SelectItem>
                <SelectItem value="restart" className="text-[#2A4759]">restart</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <VMSelector 
            vms={vms} 
            selectedVMs={selectedVMs} 
            setSelectedVMs={setSelectedVMs}
            selectorId="systemctl" 
          />

          <Button 
            onClick={handleExecute} 
            className="bg-[#F79B72] text-[#2A4759] hover:bg-[#F79B72]/80"
            disabled={systemctlMutation.isPending}
          >
            {systemctlMutation.isPending ? "Executing..." : "Execute"}
          </Button>
        </div>

        <div>
          <LogDisplay logs={logs} height="400px" fixedHeight={true} title="Systemctl Operation Logs" />
        </div>
      </div>
    </div>
  );
};

export default SystemctlOperations;
