
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
import { Checkbox } from "@/components/ui/checkbox";
import LogDisplay from '@/components/LogDisplay';

const SqlOperations = () => {
  const { toast } = useToast();
  const [selectedFt, setSelectedFt] = useState<string>("");
  const [selectedFile, setSelectedFile] = useState<string>("");
  const [selectedDbUser, setSelectedDbUser] = useState<string>("");
  const [dbPassword, setDbPassword] = useState<string>("");
  const [logs, setLogs] = useState<string[]>([]);
  const [deploymentId, setDeploymentId] = useState<string | null>(null);
  const [hostname, setHostname] = useState<string>("");
  const [port, setPort] = useState<string>("5432"); // Default PostgreSQL port
  const [dbName, setDbName] = useState<string>("");
  const [customHost, setCustomHost] = useState<boolean>(false);
  const [customUser, setCustomUser] = useState<boolean>(false);
  const [customPort, setCustomPort] = useState<boolean>(false);

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

  // Fetch DB users from inventory
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

  // Fetch VM hosts from inventory
  const { data: vms = [] } = useQuery({
    queryKey: ['vms'],
    queryFn: async () => {
      const response = await fetch('/api/vms');
      if (!response.ok) {
        throw new Error('Failed to fetch VMs');
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
          hostname,
          port,
          dbName
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

  // Fetch log updates once, not continuous polling
  useEffect(() => {
    if (!deploymentId) return;
    
    // Initial logs fetch
    const fetchLogs = async () => {
      try {
        const response = await fetch(`/api/deploy/${deploymentId}/logs`);
        if (response.ok) {
          const data = await response.json();
          if (data && data.logs) {
            setLogs(data.logs);
            
            // If not complete, schedule another fetch
            if (data.status !== 'completed' && data.status !== 'failed') {
              setTimeout(fetchLogs, 3000);
            }
          }
        }
      } catch (error) {
        console.error("Error fetching logs:", error);
      }
    };
    
    fetchLogs();
    
    return () => {
      // Cleanup if needed
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

    if (!hostname) {
      toast({
        title: "Validation Error",
        description: "Please select or enter a hostname.",
        variant: "destructive",
      });
      return;
    }

    if (!port) {
      toast({
        title: "Validation Error",
        description: "Please enter a port.",
        variant: "destructive",
      });
      return;
    }

    if (!dbName) {
      toast({
        title: "Validation Error",
        description: "Please enter a database name.",
        variant: "destructive",
      });
      return;
    }

    setLogs([]);
    sqlDeployMutation.mutate();
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-[#F79B72] mb-4">SQL Deployment</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="space-y-4">
            <div>
              <Label htmlFor="sql-ft-select" className="text-[#F79B72]">Select FT</Label>
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
              <Label htmlFor="sql-file-select" className="text-[#F79B72]">Select SQL File</Label>
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

            {/* Host selection */}
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="custom-host" 
                  checked={customHost} 
                  onCheckedChange={(checked) => {
                    setCustomHost(checked === true);
                    if (!checked) setHostname("");
                  }}
                />
                <Label htmlFor="custom-host" className="text-[#F79B72]">Enter hostname manually</Label>
              </div>
              
              {customHost ? (
                <div>
                  <Label htmlFor="hostname" className="text-[#F79B72]">Hostname</Label>
                  <Input 
                    id="hostname" 
                    value={hostname} 
                    onChange={(e) => setHostname(e.target.value)}
                    className="bg-[#EEEEEE] border-[#2A4759] text-[#2A4759]"
                    placeholder="Enter database hostname"
                  />
                </div>
              ) : (
                <div>
                  <Label htmlFor="host-select" className="text-[#F79B72]">Select Host</Label>
                  <Select value={hostname} onValueChange={setHostname}>
                    <SelectTrigger id="host-select" className="bg-[#EEEEEE] border-[#2A4759] text-[#2A4759]">
                      <SelectValue placeholder="Select a host" className="text-[#2A4759]" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#DDDDDD] border-[#2A4759] text-[#2A4759]">
                      {vms.map((vm: any) => (
                        <SelectItem key={vm.name} value={vm.ip} className="text-[#2A4759]">
                          {vm.name} ({vm.ip})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Port selection */}
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="custom-port" 
                  checked={customPort} 
                  onCheckedChange={(checked) => {
                    setCustomPort(checked === true);
                    if (!checked) setPort("5432");
                  }}
                />
                <Label htmlFor="custom-port" className="text-[#F79B72]">Enter port manually</Label>
              </div>
              
              <div>
                <Label htmlFor="port" className="text-[#F79B72]">Port</Label>
                <Input 
                  id="port" 
                  value={port} 
                  onChange={(e) => setPort(e.target.value)}
                  className="bg-[#EEEEEE] border-[#2A4759] text-[#2A4759]"
                  placeholder="Enter database port"
                />
              </div>
            </div>

            {/* DB Name */}
            <div>
              <Label htmlFor="db-name" className="text-[#F79B72]">Database Name</Label>
              <Input 
                id="db-name" 
                value={dbName} 
                onChange={(e) => setDbName(e.target.value)}
                className="bg-[#EEEEEE] border-[#2A4759] text-[#2A4759]"
                placeholder="Enter database name"
              />
            </div>

            {/* DB User selection */}
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="custom-user" 
                  checked={customUser} 
                  onCheckedChange={(checked) => {
                    setCustomUser(checked === true);
                    if (!checked) setSelectedDbUser("");
                  }}
                />
                <Label htmlFor="custom-user" className="text-[#F79B72]">Enter database user manually</Label>
              </div>
              
              {customUser ? (
                <div>
                  <Label htmlFor="db-user" className="text-[#F79B72]">Database User</Label>
                  <Input 
                    id="db-user" 
                    value={selectedDbUser} 
                    onChange={(e) => setSelectedDbUser(e.target.value)}
                    className="bg-[#EEEEEE] border-[#2A4759] text-[#2A4759]"
                    placeholder="Enter database username"
                  />
                </div>
              ) : (
                <div>
                  <Label htmlFor="db-user-select" className="text-[#F79B72]">Select DB User</Label>
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
              )}
            </div>

            <div>
              <Label htmlFor="db-password" className="text-[#F79B72]">DB Password</Label>
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

        <div className="h-full">
          <LogDisplay logs={logs} height="400px" title="SQL Deployment Logs" fixAutoScroll={true} />
        </div>
      </div>
    </div>
  );
};

export default SqlOperations;
