
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

interface DbConnection {
  hostname: string;
  port: string;
  users: string[];
}

const SqlOperations = () => {
  const { toast } = useToast();
  const [selectedFt, setSelectedFt] = useState<string>("");
  const [selectedFile, setSelectedFile] = useState<string>("");
  const [selectedDbUser, setSelectedDbUser] = useState<string>("");
  const [dbPassword, setDbPassword] = useState<string>("");
  const [logs, setLogs] = useState<string[]>([]);
  const [deploymentId, setDeploymentId] = useState<string | null>(null);
  const [hostname, setHostname] = useState<string>("10.172.145.204");
  const [port, setPort] = useState<string>("5400"); // Default port
  const [dbName, setDbName] = useState<string>("");
  const [customHost, setCustomHost] = useState<boolean>(false);
  const [customUser, setCustomUser] = useState<boolean>(false);
  const [customPort, setCustomPort] = useState<boolean>(false);
  const [selectedConnection, setSelectedConnection] = useState<string>("10.172.145.204");
  const [availableDbUsers, setAvailableDbUsers] = useState<string[]>([]);
  const [operationStatus, setOperationStatus] = useState<'idle' | 'loading' | 'running' | 'success' | 'failed' | 'completed'>('idle');

  // Fetch all FTs
  const { data: fts = [] } = useQuery({
    queryKey: ['sql-fts'],
    queryFn: async () => {
      const response = await fetch('/api/fts?type=sql');
      if (!response.ok) {
        throw new Error('Failed to fetch SQL FTs');
      }
      return response.json();
    },
    refetchOnWindowFocus: false,
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
    refetchOnWindowFocus: false,
  });

  // Fetch DB connections from db_inventory
  const { data: dbConnections = [] } = useQuery({
    queryKey: ['db-connections'],
    queryFn: async () => {
      try {
        // Try to fetch the db_inventory.json directly
        const response = await fetch('/inventory/db_inventory.json');
        if (!response.ok) {
          throw new Error('Failed to fetch db_inventory.json');
        }
        const data = await response.json();
        return data.db_connections || [];
      } catch (error) {
        console.error('Error fetching DB connections:', error);
        // Fallback to API endpoint if needed
        try {
          const apiResponse = await fetch('/api/db/connections');
          if (!apiResponse.ok) {
            throw new Error('Failed to fetch DB connections from API');
          }
          return await apiResponse.json();
        } catch (apiError) {
          console.error('Error fetching from API:', apiError);
          return [];
        }
      }
    },
    refetchOnWindowFocus: false,
  });

  // Fetch DB users from inventory
  const { data: dbUsers = [] } = useQuery({
    queryKey: ['db-users'],
    queryFn: async () => {
      try {
        // Try to fetch the db_inventory.json directly
        const response = await fetch('/inventory/db_inventory.json');
        if (!response.ok) {
          throw new Error('Failed to fetch db_inventory.json');
        }
        const data = await response.json();
        return data.db_users || [];
      } catch (error) {
        console.error('Error fetching DB users:', error);
        // Fallback to API endpoint if needed
        try {
          const apiResponse = await fetch('/api/db/users');
          if (!apiResponse.ok) {
            throw new Error('Failed to fetch DB users from API');
          }
          return await apiResponse.json();
        } catch (apiError) {
          console.error('Error fetching from API:', apiError);
          return ["xpidbo1cfg", "postgres", "dbadmin"]; // Default values
        }
      }
    },
    refetchOnWindowFocus: false,
  });

  // Update available users when connection changes
  useEffect(() => {
    if (!customUser && selectedConnection && dbConnections.length > 0) {
      const connection = dbConnections.find((conn: DbConnection) => conn.hostname === selectedConnection);
      
      if (connection) {
        setAvailableDbUsers(connection.users);
        setSelectedDbUser("");
        
        if (!customPort) {
          setPort(connection.port);
        }
      }
    }
  }, [selectedConnection, dbConnections, customUser, customPort]);

  // Deploy SQL mutation
  const sqlDeployMutation = useMutation({
    mutationFn: async () => {
      setOperationStatus('loading');
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
      setOperationStatus('running');
      return data;
    },
    onSuccess: () => {
      toast({
        title: "SQL Deployment Started",
        description: "SQL deployment has been initiated.",
      });
    },
    onError: (error) => {
      setOperationStatus('failed');
      toast({
        title: "SQL Deployment Failed",
        description: error instanceof Error ? error.message : "Failed to deploy SQL",
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
        if (!response.ok) {
          throw new Error('Failed to fetch logs');
        }
        
        const data = await response.json();
        if (data && data.logs) {
          setLogs(data.logs);
          
          // Check if status is explicitly completed or failed
          if (data.status === 'completed' || data.status === 'success') {
            setOperationStatus('success');
            if (pollingInterval) window.clearTimeout(pollingInterval as unknown as number);
            return;
          }
          
          if (data.status === 'failed') {
            setOperationStatus('failed');
            if (pollingInterval) window.clearTimeout(pollingInterval as unknown as number);
            return;
          }
          
          // Check for implicit completion by checking if logs haven't changed for a while
          if (data.logs.length === previousLogLength) {
            consecutiveSameLogCount++;
            // If logs haven't changed for 5 consecutive checks, consider it completed
            if (consecutiveSameLogCount >= 5) {
              console.log("Operation appears to be complete (logs unchanged)");
              setOperationStatus('success');
              if (pollingInterval) window.clearTimeout(pollingInterval as unknown as number);
              return;
            }
          } else {
            consecutiveSameLogCount = 0;
            previousLogLength = data.logs.length;
          }
        }
        
        // Schedule another fetch
        pollingInterval = window.setTimeout(fetchLogs, 2000) as unknown as number;
      } catch (error) {
        console.error("Error fetching logs:", error);
        consecutiveSameLogCount++;
        if (consecutiveSameLogCount >= 3) {
          setOperationStatus('failed');
          if (pollingInterval) window.clearTimeout(pollingInterval as unknown as number);
        } else {
          pollingInterval = window.setTimeout(fetchLogs, 2000) as unknown as number;
        }
      }
    };
    
    fetchLogs();
    
    return () => {
      if (pollingInterval) window.clearTimeout(pollingInterval as unknown as number);
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
    setOperationStatus('idle');
    sqlDeployMutation.mutate();
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-[#F79B72] mb-4">SQL Deployment</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4 bg-[#EEEEEE] p-4 rounded-md">
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

            {/* Database Connection Selection */}
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="custom-connection" 
                  checked={customHost} 
                  onCheckedChange={(checked) => {
                    setCustomHost(checked === true);
                    if (checked === false) {
                      setHostname(dbConnections.length > 0 ? dbConnections[0].hostname : "10.172.145.204");
                      setSelectedConnection(dbConnections.length > 0 ? dbConnections[0].hostname : "10.172.145.204");
                    }
                  }}
                />
                <Label htmlFor="custom-connection" className="text-[#F79B72]">Enter database hostname manually</Label>
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
                  <Label htmlFor="db-connection-select" className="text-[#F79B72]">Select Database Connection</Label>
                  <Select value={selectedConnection} onValueChange={(value) => {
                    setSelectedConnection(value);
                    setHostname(value);
                  }}>
                    <SelectTrigger id="db-connection-select" className="bg-[#EEEEEE] border-[#2A4759] text-[#2A4759]">
                      <SelectValue placeholder="Select a connection" className="text-[#2A4759]" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#DDDDDD] border-[#2A4759] text-[#2A4759]">
                      {dbConnections.map((conn: DbConnection) => (
                        <SelectItem key={conn.hostname} value={conn.hostname} className="text-[#2A4759]">
                          {conn.hostname}:{conn.port}
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
                    if (!checked && selectedConnection) {
                      const connection = dbConnections.find((conn: DbConnection) => conn.hostname === selectedConnection);
                      if (connection) {
                        setPort(connection.port);
                      } else {
                        setPort("5432");
                      }
                    }
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
                  disabled={!customPort}
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
                placeholder="Enter database name (e.g., ocstc1p)"
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
                    placeholder="Enter database username (e.g., xpidbo1cfg)"
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
                      {(customHost || !selectedConnection ? dbUsers : availableDbUsers).map((user: string) => (
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
              disabled={sqlDeployMutation.isPending || operationStatus === 'running' || operationStatus === 'loading'}
            >
              {sqlDeployMutation.isPending || operationStatus === 'running' || operationStatus === 'loading' ? 
                "Deploying..." : "Deploy SQL"}
            </Button>
          </div>
        </div>

        <div className="h-full">
          <LogDisplay 
            logs={logs} 
            height="400px" 
            title="SQL Deployment Logs" 
            fixAutoScroll={true} 
            status={operationStatus}
          />
        </div>
      </div>
    </div>
  );
};

export default SqlOperations;
