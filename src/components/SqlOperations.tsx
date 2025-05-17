
import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

const SqlOperations = () => {
  const { toast } = useToast();
  const [selectedFt, setSelectedFt] = useState<string>("");
  const [selectedFile, setSelectedFile] = useState<string>("");
  const [selectedDbUser, setSelectedDbUser] = useState<string>("");
  const [dbPassword, setDbPassword] = useState<string>("");
  const [logs, setLogs] = useState<string[]>([]);
  const [deploymentId, setDeploymentId] = useState<string | null>(null);

  // Fetch all FTs
  const { data: fts = [] } = useQuery({
    queryKey: ['sql-fts'],
    queryFn: async () => {
      const response = await fetch('/api/fts?type=sql');
      if (!response.ok) {
        throw new Error('Failed to fetch SQL FTs');
      }
      return response.json();
    }
  });

  // Fetch SQL files for selected FT
  const { data: sqlFiles = [] } = useQuery({
    queryKey: ['sql-files', selectedFt],
    queryFn: async () => {
      if (!selectedFt) return [];
      const response = await fetch(`/api/fts/${selectedFt}/files?type=sql`);
      if (!response.ok) {
        throw new Error('Failed to fetch SQL files');
      }
      return response.json();
    },
    enabled: !!selectedFt,
  });

  // Fetch DB users
  const { data: dbUsers = [] } = useQuery({
    queryKey: ['db-users'],
    queryFn: async () => {
      const response = await fetch('/api/db/users');
      if (!response.ok) {
        throw new Error('Failed to fetch DB users');
      }
      return response.json();
    }
  });

  // Deploy SQL mutation
  const sqlDeployMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/deploy/sql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ft: selectedFt,
          file: selectedFile,
          dbUser: selectedDbUser,
          dbPassword,
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to deploy SQL');
      }
      
      const data = await response.json();
      setDeploymentId(data.deploymentId);
      return data;
    },
    onSuccess: () => {
      toast({
        title: "SQL Deployment Started",
        description: "SQL deployment has been initiated.",
      });
    },
    onError: (error) => {
      toast({
        title: "SQL Deployment Failed",
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
        description: "Please select a SQL file.",
        variant: "destructive",
      });
      return;
    }
    
    if (!selectedDbUser) {
      toast({
        title: "Validation Error",
        description: "Please select a database user.",
        variant: "destructive",
      });
      return;
    }
    
    if (!dbPassword) {
      toast({
        title: "Validation Error",
        description: "Please enter the database password.",
        variant: "destructive",
      });
      return;
    }

    setLogs([]);
    sqlDeployMutation.mutate();
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-[#2A4759] mb-4">SQL Deployment</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="space-y-4 bg-[#EEEEEE] p-4 rounded-md">
            <div>
              <Label htmlFor="sql-ft-select" className="text-[#2A4759]">Select FT</Label>
              <Select value={selectedFt} onValueChange={setSelectedFt}>
                <SelectTrigger id="sql-ft-select" className="bg-[#EEEEEE] border-[#2A4759] text-[#2A4759]">
                  <SelectValue placeholder="Select an FT" className="text-[#2A4759]" />
                </SelectTrigger>
                <SelectContent className="bg-[#DDDDDD] border-[#2A4759] text-[#2A4759]">
                  {fts.map((ft: string) => (
                    <SelectItem key={ft} value={ft} className="text-[#2A4759]">{ft}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="sql-file-select" className="text-[#2A4759]">Select SQL File</Label>
              <Select 
                value={selectedFile} 
                onValueChange={setSelectedFile}
                disabled={!selectedFt}
              >
                <SelectTrigger id="sql-file-select" className="bg-[#EEEEEE] border-[#2A4759] text-[#2A4759]">
                  <SelectValue placeholder="Select a SQL file" className="text-[#2A4759]" />
                </SelectTrigger>
                <SelectContent className="bg-[#DDDDDD] border-[#2A4759] text-[#2A4759]">
                  {sqlFiles.map((file: string) => (
                    <SelectItem key={file} value={file} className="text-[#2A4759]">{file}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="db-user-select" className="text-[#2A4759]">Select DB User</Label>
              <Select value={selectedDbUser} onValueChange={setSelectedDbUser}>
                <SelectTrigger id="db-user-select" className="bg-[#EEEEEE] border-[#2A4759] text-[#2A4759]">
                  <SelectValue placeholder="Select a database user" className="text-[#2A4759]" />
                </SelectTrigger>
                <SelectContent className="bg-[#DDDDDD] border-[#2A4759] text-[#2A4759]">
                  {dbUsers.map((user: string) => (
                    <SelectItem key={user} value={user} className="text-[#2A4759]">{user}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="db-password" className="text-[#2A4759]">DB Password</Label>
              <Input 
                id="db-password" 
                type="password"
                value={dbPassword} 
                onChange={(e) => setDbPassword(e.target.value)}
                className="bg-[#EEEEEE] border-[#2A4759] text-[#2A4759]"
              />
            </div>

            <Button 
              onClick={handleDeploy} 
              className="bg-[#F79B72] text-[#2A4759] hover:bg-[#F79B72]/80"
              disabled={sqlDeployMutation.isPending}
            >
              {sqlDeployMutation.isPending ? "Deploying..." : "Deploy SQL"}
            </Button>
          </div>
        </div>

        <div>
          <LogDisplay logs={logs} height="300px" title="SQL Deployment Logs" />
        </div>
      </div>
    </div>
  );
};

export default SqlOperations;
