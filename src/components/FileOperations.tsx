import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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

const FileOperations: React.FC = () => {
  const { toast } = useToast();
  const [selectedFt, setSelectedFt] = useState<string>("");
  const [selectedFile, setSelectedFile] = useState<string>("");
  const [selectedUser, setSelectedUser] = useState<string>("infadm");
  const [targetPath, setTargetPath] = useState<string>("");
  const [selectedVMs, setSelectedVMs] = useState<string[]>([]);
  const [useSudo, setUseSudo] = useState<boolean>(false);
  const [createBackup, setCreateBackup] = useState<boolean>(true);
  const [fileLogs, setFileLogs] = useState<string[]>([]);
  const [deploymentId, setDeploymentId] = useState<string | null>(null);
  const [shellCommand, setShellCommand] = useState<string>("");
  
  // Shell command options
  const [shellSelectedVMs, setShellSelectedVMs] = useState<string[]>([]);
  const [shellSelectedUser, setShellSelectedUser] = useState<string>("infadm");
  const [shellUseSudo, setShellUseSudo] = useState<boolean>(false);
  const [shellTargetPath, setShellTargetPath] = useState<string>("");
  const [shellWorkingDir, setShellWorkingDir] = useState<string>("");
  const [shellCommandId, setShellCommandId] = useState<string | null>(null);
  const [shellLogs, setShellLogs] = useState<string[]>([]);
  const [vms, setVms] = useState<string[]>([]);
  const [validateUseSudo, setValidateUseSudo] = useState<boolean>(false);

  // Fetch all FTs
  const { data: fts = [] } = useQuery({
    queryKey: ['fts'],
    queryFn: async () => {
      const response = await fetch('/api/fts');
      if (!response.ok) {
        throw new Error('Failed to fetch FTs');
      }
      return response.json();
    }
  });

  // Fetch files for selected FT
  const { data: files = [] } = useQuery({
    queryKey: ['files', selectedFt],
    queryFn: async () => {
      if (!selectedFt) return [];
      const response = await fetch(`/api/fts/${selectedFt}/files`);
      if (!response.ok) {
        throw new Error('Failed to fetch files');
      }
      return response.json();
    },
    enabled: !!selectedFt,
  });

  // Deploy mutation
  const deployMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/deploy/file', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ft: selectedFt,
          file: selectedFile,
          user: selectedUser,
          targetPath,
          vms: selectedVMs,
          sudo: useSudo,
          createBackup: createBackup,
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to deploy');
      }
      
      const data = await response.json();
      setDeploymentId(data.deploymentId);
      return data;
    },
    onSuccess: () => {
      toast({
        title: "Deployment Started",
        description: "File deployment has been initiated.",
      });
      // Don't navigate away - let the logs update in place
    },
    onError: (error) => {
      toast({
        title: "Deployment Failed",
        description: error instanceof Error ? error.message : "An unknown error occurred",
        variant: "destructive",
      });
    },
  });

  // Validate mutation
  const validateMutation = useMutation({
    mutationFn: async () => {
      if (!deploymentId) {
        throw new Error('No active deployment to validate');
      }
      
      const response = await fetch(`/api/deploy/${deploymentId}/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sudo: validateUseSudo
        })
      });
      
      if (!response.ok) {
        throw new Error('Validation failed');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Validation Complete",
        description: "File checksum validation has been completed.",
      });
      // Add validation results to logs
      if (data.results) {
        data.results.forEach((result: any) => {
          const checksum = result.cksum ? `Checksum: ${result.cksum}` : 'No checksum available';
          const permissions = result.permissions ? `Permissions: ${result.permissions}` : '';
          
          setFileLogs(prev => [
            ...prev, 
            `Validation on ${result.vm}: ${result.status}`, 
            checksum, 
            permissions
          ]);
        });
      }
    },
    onError: (error) => {
      toast({
        title: "Validation Failed",
        description: error instanceof Error ? error.message : "An unknown error occurred",
        variant: "destructive",
      });
    },
  });

  // Run shell command mutation
  const shellCommandMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/command/shell', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          command: shellCommand,
          vms: shellSelectedVMs,
          sudo: shellUseSudo,
          user: shellSelectedUser,
          workingDir: shellWorkingDir || shellTargetPath,
        }),
      });
      
      if (!response.ok) {
        throw new Error('Shell command execution failed');
      }
      
      const data = await response.json();
      setShellCommandId(data.deploymentId || data.commandId); // Store the command ID for live logs
      return data;
    },
    onSuccess: () => {
      toast({
        title: "Command Executed",
        description: "Shell command has been initiated.",
      });
      // The actual results will come through the EventSource
    },
    onError: (error) => {
      toast({
        title: "Command Failed",
        description: error instanceof Error ? error.message : "An unknown error occurred",
        variant: "destructive",
      });
    },
  });

  // Add a function to poll for logs
  const startPollingLogs = (id: string, logSetter: React.Dispatch<React.SetStateAction<string[]>>) => {
    if (!id) return;
    
    // Start with a clear log display
    logSetter([]);
    
    // Set up polling interval
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/deploy/${id}/logs`);
        if (!response.ok) {
          throw new Error('Failed to fetch logs');
        }
        
        const data = await response.json();
        if (data.logs) {
          logSetter(data.logs);
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

  // Fetch log updates for file deployments
  useEffect(() => {
    if (deploymentId) {
      return startPollingLogs(deploymentId, setFileLogs);
    }
  }, [deploymentId]);

  // Fetch log updates for shell commands
  useEffect(() => {
    if (shellCommandId) {
      return startPollingLogs(shellCommandId, setShellLogs);
    }
  }, [shellCommandId]);

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

  const handleDeploy = (e: React.MouseEvent) => {
    e.preventDefault(); // Prevent the default action
    
    if (!selectedFt) {
      toast({
        title: "Validation Error",
        description: "Please select an FT.",
        variant: "destructive",
      });
      return;
    }
    
    if (!selectedFile) {
      toast({
        title: "Validation Error",
        description: "Please select a file.",
        variant: "destructive",
      });
      return;
    }
    
    if (!targetPath) {
      toast({
        title: "Validation Error",
        description: "Please enter a target path.",
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

    setFileLogs([]);
    deployMutation.mutate();
  };

  const handleRunShellCommand = (e: React.MouseEvent) => {
    e.preventDefault(); // Prevent the default action
    
    if (!shellCommand) {
      toast({
        title: "Validation Error",
        description: "Please enter a shell command.",
        variant: "destructive",
      });
      return;
    }

    if (shellSelectedVMs.length === 0) {
      toast({
        title: "Validation Error",
        description: "Please select at least one VM for shell command.",
        variant: "destructive",
      });
      return;
    }

    setShellLogs([]);
    shellCommandMutation.mutate();
  };

  // Calculate the height for file deployment section
  const fileDeploymentHeight = "345px"; 
  // Calculate the height for shell command section
  const shellCommandHeight = "485px";

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-[#F79B72] mb-4">File Operations</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-6">
          {/* File Deployment Section */}
          <div className="space-y-4 bg-[#1a2b42] p-4 rounded-md">
            <h3 className="text-lg font-medium text-[#F79B72]">File Deployment</h3>

            <div>
              <Label htmlFor="ft-select" className="text-[#F79B72]">Select FT</Label>
              <Select value={selectedFt} onValueChange={setSelectedFt}>
                <SelectTrigger id="ft-select" className="bg-[#1a2b42] border-[#EEEEEE] text-[#EEEEEE]">
                  <SelectValue placeholder="Select an FT" className="text-[#EEEEEE]" />
                </SelectTrigger>
                <SelectContent className="bg-[#2A4759] border-[#EEEEEE] text-[#EEEEEE]">
                  {fts.map((ft: string) => (
                    <SelectItem key={ft} value={ft} className="text-[#EEEEEE]">{ft}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="file-select" className="text-[#F79B72]">Select File</Label>
              <Select 
                value={selectedFile} 
                onValueChange={setSelectedFile}
                disabled={!selectedFt}
              >
                <SelectTrigger id="file-select" className="bg-[#1a2b42] border-[#EEEEEE] text-[#EEEEEE]">
                  <SelectValue placeholder="Select a file" className="text-[#EEEEEE]" />
                </SelectTrigger>
                <SelectContent className="bg-[#2A4759] border-[#EEEEEE] text-[#EEEEEE]">
                  {files.map((file: string) => (
                    <SelectItem key={file} value={file} className="text-[#EEEEEE]">{file}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="user-select" className="text-[#F79B72]">Select User</Label>
              <Select value={selectedUser} onValueChange={setSelectedUser}>
                <SelectTrigger id="user-select" className="bg-[#1a2b42] border-[#EEEEEE] text-[#EEEEEE]">
                  <SelectValue placeholder="Select a user" className="text-[#EEEEEE]" />
                </SelectTrigger>
                <SelectContent className="bg-[#2A4759] border-[#EEEEEE] text-[#EEEEEE]">
                  <SelectItem value="infadm" className="text-[#EEEEEE]">infadm</SelectItem>
                  <SelectItem value="abpwrk1" className="text-[#EEEEEE]">abpwrk1</SelectItem>
                  <SelectItem value="root" className="text-[#EEEEEE]">root</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="target-path" className="text-[#F79B72]">Target Path</Label>
              <Input 
                id="target-path" 
                value={targetPath} 
                onChange={(e) => setTargetPath(e.target.value)}
                placeholder="/opt/amdocs/abpwrk1/pbin/app" 
                className="bg-[#1a2b42] border-[#EEEEEE] text-[#EEEEEE]"
              />
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox 
                id="sudo" 
                checked={useSudo} 
                onCheckedChange={(checked) => setUseSudo(checked === true)}
              />
              <Label htmlFor="sudo" className="text-[#F79B72]">Use sudo</Label>
            </div>
            
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="backup" 
                checked={createBackup} 
                onCheckedChange={(checked) => setCreateBackup(checked === true)}
              />
              <Label htmlFor="backup" className="text-[#F79B72]">Create backup if file exists</Label>
            </div>

            <VMSelector 
              vms={vms} 
              selectedVMs={selectedVMs} 
              setSelectedVMs={setSelectedVMs}
              selectorId="file-deployment" 
            />

            <div className="flex space-x-2">
              <Button 
                type="button" // Changed to button type
                onClick={handleDeploy} 
                className="bg-[#F79B72] text-[#2A4759] hover:bg-[#F79B72]/80"
                disabled={deployMutation.isPending}
              >
                {deployMutation.isPending ? "Deploying..." : "Deploy"}
              </Button>
              
              <div className="flex space-x-2 ml-2">
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="validate-sudo" 
                    checked={validateUseSudo} 
                    onCheckedChange={(checked) => setValidateUseSudo(checked === true)}
                  />
                  <Label htmlFor="validate-sudo" className="text-[#F79B72]">Sudo</Label>
                </div>
                <Button 
                  onClick={() => validateMutation.mutate()}
                  className="bg-[#2A4759] hover:bg-[#2A4759]/80 text-white"
                  disabled={!deploymentId || validateMutation.isPending}
                >
                  Validate
                </Button>
              </div>
            </div>
          </div>
          
          {/* Shell Command Section */}
          <div className="space-y-4 bg-[#1a2b42] p-4 rounded-md">
            <h3 className="text-lg font-medium text-[#F79B72]">Shell Command</h3>
            
            <div>
              <Label htmlFor="shell-user-select" className="text-[#F79B72]">Select User</Label>
              <Select value={shellSelectedUser} onValueChange={setShellSelectedUser}>
                <SelectTrigger id="shell-user-select" className="bg-[#1a2b42] border-[#EEEEEE] text-[#EEEEEE]">
                  <SelectValue placeholder="Select a user" className="text-[#EEEEEE]" />
                </SelectTrigger>
                <SelectContent className="bg-[#2A4759] border-[#EEEEEE] text-[#EEEEEE]">
                  <SelectItem value="infadm" className="text-[#EEEEEE]">infadm</SelectItem>
                  <SelectItem value="abpwrk1" className="text-[#EEEEEE]">abpwrk1</SelectItem>
                  <SelectItem value="root" className="text-[#EEEEEE]">root</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="shell-target-path" className="text-[#F79B72]">Default User Home Path</Label>
              <Input 
                id="shell-target-path" 
                value={shellTargetPath} 
                onChange={(e) => setShellTargetPath(e.target.value)}
                placeholder="/home/infadm" 
                className="bg-[#1a2b42] border-[#EEEEEE] text-[#EEEEEE]"
              />
            </div>
            
            <div>
              <Label htmlFor="shell-working-dir" className="text-[#F79B72]">Command Working Directory</Label>
              <Input 
                id="shell-working-dir" 
                value={shellWorkingDir} 
                onChange={(e) => setShellWorkingDir(e.target.value)}
                placeholder="/opt/amdocs/scripts" 
                className="bg-[#1a2b42] border-[#EEEEEE] text-[#EEEEEE]"
              />
            </div>
            
            <div>
              <Label htmlFor="shell-command" className="text-[#F79B72]">Command (chmod, chown, etc.)</Label>
              <Input 
                id="shell-command" 
                value={shellCommand} 
                onChange={(e) => setShellCommand(e.target.value)}
                placeholder="chmod 755 /path/to/file" 
                className="bg-[#1a2b42] border-[#EEEEEE] text-[#EEEEEE]"
              />
            </div>
            
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="shell-sudo" 
                checked={shellUseSudo} 
                onCheckedChange={(checked) => setShellUseSudo(checked === true)}
              />
              <Label htmlFor="shell-sudo" className="text-[#F79B72]">Use sudo</Label>
            </div>
            
            <VMSelector 
              vms={vms} 
              selectedVMs={shellSelectedVMs} 
              setSelectedVMs={setShellSelectedVMs}
              selectorId="shell-command" 
            />

            <Button 
              type="button" // Changed to button type
              onClick={handleRunShellCommand} 
              className="bg-[#F79B72] text-[#2A4759] hover:bg-[#F79B72]/80"
              disabled={shellCommandMutation.isPending}
            >
              {shellCommandMutation.isPending ? "Running..." : "Run Command"}
            </Button>
          </div>
        </div>
        
        {/* Logs Section - Aligned to match respective operation sections */}
        <div className="space-y-6">
          {/* File Deployment Logs */}
          <div>
            <LogDisplay 
              logs={fileLogs} 
              height={fileDeploymentHeight} 
              fixedHeight={true}
              title="File Deployment Logs" 
            />
          </div>
          
          {/* Shell Command Logs */}
          <div>
            <LogDisplay 
              logs={shellLogs} 
              height={shellCommandHeight} 
              fixedHeight={true}
              title="Shell Command Logs" 
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default FileOperations;
