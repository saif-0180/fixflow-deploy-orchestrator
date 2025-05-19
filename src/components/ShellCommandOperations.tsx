
import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from '@tanstack/react-query';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import LogDisplay from '@/components/LogDisplay';
import VMSelector from '@/components/VMSelector';

const ShellCommandOperations: React.FC = () => {
  const { toast } = useToast();
  const [command, setCommand] = useState<string>("");
  const [selectedVMs, setSelectedVMs] = useState<string[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [deploymentId, setDeploymentId] = useState<string | null>(null);
  const [vms, setVms] = useState<string[]>([]);
  const [useSudo, setUseSudo] = useState<boolean>(false);
  const [useCustomPath, setUseCustomPath] = useState<boolean>(false);
  const [customPath, setCustomPath] = useState<string>("");
  const [selectedUser, setSelectedUser] = useState<string>("infadm");
  const [users] = useState<string[]>(["infadm", "abpwrk1", "root"]);

  // Fetch VMs on component mount
  useEffect(() => {
    const fetchVMs = async () => {
      try {
        const response = await fetch('/api/vms');
        if (!response.ok) {
          throw new Error('Failed to fetch VMs');
        }
        const data = await response.json();
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

  // Shell command mutation
  const shellCommandMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/shell/command', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          command: command,
          vms: selectedVMs,
          sudo: useSudo,
          user: selectedUser,
          working_dir: useCustomPath ? customPath : null
        }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to execute shell command');
      }
      
      const data = await response.json();
      setDeploymentId(data.deploymentId);
      return data;
    },
    onSuccess: (data) => {
      toast({
        title: "Command Started",
        description: "Shell command execution has been initiated.",
      });
      startPollingLogs(data.deploymentId);
    },
    onError: (error) => {
      toast({
        title: "Command Failed",
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
    
    // Set up polling interval
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/deploy/${id}/logs`);
        if (!response.ok) {
          throw new Error('Failed to fetch logs');
        }
        
        const data = await response.json();
        if (data.logs) {
          setLogs(data.logs);
        }
        
        // Stop polling if operation is complete
        if (data.status !== 'running' && data.status !== 'pending') {
          clearInterval(pollInterval);
        }
      } catch (error) {
        console.error('Error fetching logs:', error);
        clearInterval(pollInterval);
      }
    }, 1000); // Poll every second
    
    // Clean up on unmount
    return () => {
      clearInterval(pollInterval);
    };
  };

  // Fetch log updates if deploymentId is set
  useEffect(() => {
    if (deploymentId) {
      return startPollingLogs(deploymentId);
    }
  }, [deploymentId]);

  const handleExecute = (e: React.MouseEvent) => {
    e.preventDefault(); // Prevent default action
    
    if (!command.trim()) {
      toast({
        title: "Validation Error",
        description: "Please enter a command to execute.",
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

    if (useCustomPath && !customPath.trim()) {
      toast({
        title: "Validation Error",
        description: "Please enter a working directory or uncheck the custom path option.",
        variant: "destructive",
      });
      return;
    }

    setLogs([]);
    shellCommandMutation.mutate();
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-[#F79B72] mb-4">Shell Command Execution</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4 bg-[#EEEEEE] p-4 rounded-md">
          <div>
            <Label htmlFor="command" className="text-[#F79B72]">Command</Label>
            <Input
              id="command"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="Enter shell command"
              className="bg-[#EEEEEE] border-[#2A4759] text-[#2A4759]"
            />
          </div>

          <div>
            <Label htmlFor="user-select" className="text-[#F79B72]">Select User</Label>
            <Select value={selectedUser} onValueChange={setSelectedUser}>
              <SelectTrigger id="user-select" className="bg-[#EEEEEE] border-[#2A4759] text-[#2A4759]">
                <SelectValue placeholder="Select a user" className="text-[#2A4759]" />
              </SelectTrigger>
              <SelectContent className="bg-[#DDDDDD] border-[#2A4759] text-[#2A4759]">
                {users.map((user: string) => (
                  <SelectItem key={user} value={user} className="text-[#2A4759]">{user}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <VMSelector 
            vms={vms} 
            selectedVMs={selectedVMs} 
            setSelectedVMs={setSelectedVMs}
            selectorId="shell-command" 
          />

          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="use-sudo" 
                checked={useSudo} 
                onCheckedChange={(checked) => setUseSudo(checked as boolean)}
              />
              <Label htmlFor="use-sudo" className="text-[#2A4759]">Use sudo</Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox 
                id="use-custom-path" 
                checked={useCustomPath} 
                onCheckedChange={(checked) => setUseCustomPath(checked as boolean)}
              />
              <Label htmlFor="use-custom-path" className="text-[#2A4759]">Specify working directory</Label>
            </div>

            {useCustomPath && (
              <div>
                <Label htmlFor="custom-path" className="text-[#F79B72]">Working Directory</Label>
                <Input
                  id="custom-path"
                  value={customPath}
                  onChange={(e) => setCustomPath(e.target.value)}
                  placeholder="Enter working directory path"
                  className="bg-[#EEEEEE] border-[#2A4759] text-[#2A4759]"
                />
              </div>
            )}
          </div>

          <Button 
            type="button"
            onClick={handleExecute}
            className="bg-[#F79B72] text-[#2A4759] hover:bg-[#F79B72]/80"
            disabled={shellCommandMutation.isPending}
          >
            {shellCommandMutation.isPending ? "Executing..." : "Execute Command"}
          </Button>
        </div>

        <div>
          <LogDisplay logs={logs} height="400px" fixedHeight={true} title="Shell Command Logs" />
        </div>
      </div>
    </div>
  );
};

export default ShellCommandOperations;
