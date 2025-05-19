
import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
  const [useSudo, setUseSudo] = useState<boolean>(true);

  // Fetch systemd services
  const { data: services = [] } = useQuery({
    queryKey: ['systemd-services'],
    queryFn: async () => {
      try {
        const response = await fetch('/api/systemd/services');
        if (!response.ok) {
          throw new Error('Failed to fetch systemd services');
        }
        return response.json();
      } catch (error) {
        console.error('Error fetching systemd services:', error);
        toast({
          title: "Error",
          description: "Failed to fetch systemd services",
          variant: "destructive",
        });
        return [];
      }
    }
  });

  // Systemctl operation mutation
  const systemctlMutation = useMutation({
    mutationFn: async () => {
      // Log the request data for debugging
      console.log("Systemctl request:", {
        service: selectedService,
        operation: selectedOperation,
        vms: selectedVMs,
        sudo: useSudo
      });
      
      const response = await fetch('/api/systemd/operation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          service: selectedService,
          operation: selectedOperation,
          vms: selectedVMs,
          sudo: useSudo
        }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to execute systemctl operation');
      }
      
      const data = await response.json();
      setDeploymentId(data.deploymentId);
      return data;
    },
    onSuccess: (data) => {
      toast({
        title: "Operation Started",
        description: `Systemctl ${selectedOperation} operation has been initiated.`,
      });
      
      // Start polling for logs immediately
      startPollingLogs(data.deploymentId);
    },
    onError: (error) => {
      console.error("Systemctl operation error:", error);
      toast({
        title: "Operation Failed",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      });
    },
  });

  // Add a function to poll for logs
  const startPollingLogs = (id: string) => {
    if (!id) return;
    
    // Start with a clear log display
    setLogs([]);
    console.log(`Starting to poll logs for deployment ${id}`);
    
    // Set up polling interval
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/deploy/${id}/logs`);
        if (!response.ok) {
          throw new Error('Failed to fetch logs');
        }
        
        const data = await response.json();
        console.log(`Received logs for ${id}:`, data);
        
        if (data.logs) {
          setLogs(data.logs);
        }
        
        // Stop polling if operation is complete
        if (data.status !== 'running' && data.status !== 'pending') {
          console.log(`Deployment ${id} is complete with status: ${data.status}`);
          clearInterval(pollInterval);
        }
      } catch (error) {
        console.error('Error fetching logs:', error);
        clearInterval(pollInterval);
      }
    }, 1000); // Poll every second
    
    return () => clearInterval(pollInterval);
  };

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
        toast({
          title: "Error",
          description: "Failed to fetch VM list",
          variant: "destructive",
        });
      }
    };
    
    fetchVMs();
  }, [toast]);

  // Fetch log updates if deploymentId is set but no polling is active
  useEffect(() => {
    if (deploymentId) {
      return startPollingLogs(deploymentId);
    }
  }, [deploymentId]);

  const handleExecute = (e: React.FormEvent) => {
    e.preventDefault(); // Prevent form submission which causes page reload
    
    if (!selectedService) {
      toast({
        title: "Validation Error",
        description: "Please select a service.",
        variant: "destructive",
      });
      return;
    }
    
    if (!selectedVMs.length) {
      toast({
        title: "Validation Error",
        description: "Please select at least one VM.",
        variant: "destructive",
      });
      return;
    }

    // Validate the operation
    if (!['status', 'start', 'stop', 'restart'].includes(selectedOperation)) {
      toast({
        title: "Validation Error",
        description: "Invalid operation. Must be one of: start, stop, restart, status",
        variant: "destructive",
      });
      return;
    }

    // Reset logs
    setLogs([]);
    systemctlMutation.mutate();
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-[#F79B72] mb-4">Systemd Service Management</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <form className="space-y-4 bg-[#EEEEEE] p-4 rounded-md">
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

          <div className="flex items-center space-x-2">
            <Checkbox 
              id="use-sudo" 
              checked={useSudo} 
              onCheckedChange={(checked) => setUseSudo(checked as boolean)}
            />
            <Label htmlFor="use-sudo" className="text-[#2A4759]">Use sudo</Label>
          </div>

          <Button 
            type="button"
            onClick={handleExecute}
            className="bg-[#F79B72] text-[#2A4759] hover:bg-[#F79B72]/80"
            disabled={systemctlMutation.isPending}
          >
            {systemctlMutation.isPending ? "Executing..." : "Execute"}
          </Button>
        </form>

        <div>
          <LogDisplay logs={logs} height="400px" fixedHeight={true} title="Systemctl Operation Logs" />
        </div>
      </div>
    </div>
  );
};

export default SystemctlOperations;
