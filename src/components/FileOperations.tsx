
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
  const [logs, setLogs] = useState<string[]>([]);
  const [deploymentId, setDeploymentId] = useState<string | null>(null);
  const [shellCommand, setShellCommand] = useState<string>("");

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
    },
    onError: (error) => {
      toast({
        title: "Deployment Failed",
        description: error.message,
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
          setLogs(prev => [...prev, `Validation on ${result.vm}: ${result.status}`]);
        });
      }
    },
    onError: (error) => {
      toast({
        title: "Validation Failed",
        description: error.message,
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
          vms: selectedVMs,
          sudo: useSudo,
        }),
      });
      
      if (!response.ok) {
        throw new Error('Shell command execution failed');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Command Executed",
        description: "Shell command has been executed.",
      });
      if (data.results) {
        data.results.forEach((result: any) => {
          setLogs(prev => [...prev, `Command on ${result.vm}: ${result.output}`]);
        });
      }
    },
    onError: (error) => {
      toast({
        title: "Command Failed",
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

  const handleDeploy = () => {
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

    setLogs([]);
    deployMutation.mutate();
  };

  const handleRunShellCommand = () => {
    if (!shellCommand) {
      toast({
        title: "Validation Error",
        description: "Please enter a shell command.",
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

    shellCommandMutation.mutate();
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-[#F97316]">File Deployment</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <Label htmlFor="ft-select">Select FT</Label>
            <Select value={selectedFt} onValueChange={setSelectedFt}>
              <SelectTrigger id="ft-select" className="bg-[#333333] border-gray-700">
                <SelectValue placeholder="Select an FT" />
              </SelectTrigger>
              <SelectContent className="bg-[#333333] border-gray-700">
                {fts.map((ft: string) => (
                  <SelectItem key={ft} value={ft}>{ft}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="file-select">Select File</Label>
            <Select 
              value={selectedFile} 
              onValueChange={setSelectedFile}
              disabled={!selectedFt}
            >
              <SelectTrigger id="file-select" className="bg-[#333333] border-gray-700">
                <SelectValue placeholder="Select a file" />
              </SelectTrigger>
              <SelectContent className="bg-[#333333] border-gray-700">
                {files.map((file: string) => (
                  <SelectItem key={file} value={file}>{file}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="user-select">Select User</Label>
            <Select value={selectedUser} onValueChange={setSelectedUser}>
              <SelectTrigger id="user-select" className="bg-[#333333] border-gray-700">
                <SelectValue placeholder="Select a user" />
              </SelectTrigger>
              <SelectContent className="bg-[#333333] border-gray-700">
                <SelectItem value="infadm">infadm</SelectItem>
                <SelectItem value="abpwrk1">abpwrk1</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="target-path">Target Path</Label>
            <Input 
              id="target-path" 
              value={targetPath} 
              onChange={(e) => setTargetPath(e.target.value)}
              placeholder="/opt/amdocs/abpwrk1/pbin/app" 
              className="bg-[#333333] border-gray-700"
            />
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox 
              id="sudo" 
              checked={useSudo} 
              onCheckedChange={(checked) => setUseSudo(checked === true)}
            />
            <Label htmlFor="sudo">Use sudo</Label>
          </div>

          <VMSelector 
            selectedVMs={selectedVMs} 
            setSelectedVMs={setSelectedVMs} 
          />

          <Button 
            onClick={handleDeploy} 
            className="bg-[#F97316] text-black hover:bg-orange-400"
            disabled={deployMutation.isPending}
          >
            {deployMutation.isPending ? "Deploying..." : "Deploy"}
          </Button>
          
          <Button 
            onClick={() => validateMutation.mutate()}
            className="ml-2 bg-gray-600 hover:bg-gray-500"
            disabled={!deploymentId || validateMutation.isPending}
          >
            Validate
          </Button>
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-medium text-[#F97316]">Shell Command</h3>
          <div>
            <Label htmlFor="shell-command">Command (chmod, chown, etc.)</Label>
            <Input 
              id="shell-command" 
              value={shellCommand} 
              onChange={(e) => setShellCommand(e.target.value)}
              placeholder="chmod 755 /path/to/file" 
              className="bg-[#333333] border-gray-700"
            />
          </div>

          <Button 
            onClick={handleRunShellCommand} 
            className="bg-[#F97316] text-black hover:bg-orange-400"
            disabled={shellCommandMutation.isPending}
          >
            {shellCommandMutation.isPending ? "Running..." : "Run Command"}
          </Button>

          <div className="mt-8">
            <LogDisplay logs={logs} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default FileOperations;
