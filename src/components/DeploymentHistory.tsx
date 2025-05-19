
import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import LogDisplay from '@/components/LogDisplay';
import { Loader2 } from 'lucide-react';

interface Deployment {
  id: string;
  type: 'file' | 'sql' | 'systemd' | 'command' | 'rollback' | string; 
  status: 'running' | 'success' | 'failed' | string;
  timestamp: string;
  ft?: string;
  file?: string;
  vms?: string[];
  service?: string;
  operation?: string;
  command?: string;
  logs?: string[];
  original_deployment?: string;
}

const DeploymentHistory: React.FC = () => {
  const { toast } = useToast();
  const [selectedDeploymentId, setSelectedDeploymentId] = useState<string | null>(null);
  const [deploymentLogs, setDeploymentLogs] = useState<string[]>([]);
  const [clearDays, setClearDays] = useState<number>(30);
  
  // Fetch deployment history with more frequent polling
  const { data: deployments = [], refetch: refetchDeployments, isLoading: isLoadingDeployments } = useQuery({
    queryKey: ['deployment-history'],
    queryFn: async () => {
      try {
        console.log("Fetching deployment history");
        const response = await fetch('/api/deployments/history');
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Failed to fetch deployment history: ${errorText}`);
          throw new Error('Failed to fetch deployment history');
        }
        const data = await response.json();
        console.log("Received deployment history data:", data);
        return data as Deployment[];
      } catch (error) {
        console.error(`Error in history fetch: ${error}`);
        throw error;
      }
    },
    staleTime: 1000, // Consider data fresh for 1 second to enable more frequent updates
    refetchInterval: 5000, // Refetch every 5 seconds to keep deployment history current
  });

  // Function to fetch logs for a specific deployment
  const fetchDeploymentLogs = async (deploymentId: string) => {
    try {
      console.log(`Fetching logs for deployment ${deploymentId}`);
      const response = await fetch(`/api/deploy/${deploymentId}/logs`);
      if (!response.ok) {
        throw new Error('Failed to fetch logs');
      }
      const data = await response.json();
      console.log(`Received logs for ${deploymentId}:`, data);
      
      if (data.logs && data.logs.length > 0) {
        setDeploymentLogs(data.logs);
        return data.logs;
      } else {
        // If no logs in response, check if the selected deployment has logs
        const selectedDeployment = deployments.find(d => d.id === deploymentId);
        if (selectedDeployment?.logs && selectedDeployment.logs.length > 0) {
          setDeploymentLogs(selectedDeployment.logs);
          return selectedDeployment.logs;
        } else {
          setDeploymentLogs(["No logs available for this deployment"]);
          return ["No logs available for this deployment"];
        }
      }
    } catch (error) {
      console.error('Error fetching logs:', error);
      setDeploymentLogs(["Error loading logs. Please try again."]);
      toast({
        title: "Error",
        description: "Failed to fetch logs for this deployment",
        variant: "destructive",
      });
      return ["Error loading logs. Please try again."];
    }
  };

  // Effect to load logs when a deployment is selected and set up polling if needed
  useEffect(() => {
    if (selectedDeploymentId) {
      fetchDeploymentLogs(selectedDeploymentId);
      
      // Set up polling for logs if the deployment is still running
      const selectedDeployment = deployments.find(d => d.id === selectedDeploymentId);
      if (selectedDeployment && selectedDeployment.status === 'running') {
        const interval = setInterval(() => {
          fetchDeploymentLogs(selectedDeploymentId);
        }, 1000); // Poll every second for active deployments
        
        return () => clearInterval(interval);
      }
    }
  }, [selectedDeploymentId, deployments]);

  // Clear logs mutation
  const clearLogsMutation = useMutation({
    mutationFn: async (days: number) => {
      const response = await fetch('/api/deployments/clear', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ days }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Failed to clear logs: ${errorText}`);
        throw new Error('Failed to clear logs');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Logs Cleared",
        description: data.message,
      });
      refetchDeployments();
      setSelectedDeploymentId(null); // Clear selection since it might be deleted
      setDeploymentLogs([]);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to clear logs",
        variant: "destructive",
      });
    },
  });

  // Rollback mutation
  const rollbackMutation = useMutation({
    mutationFn: async (deploymentId: string) => {
      const response = await fetch(`/api/deploy/${deploymentId}/rollback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Failed to rollback: ${errorText}`);
        throw new Error('Failed to rollback deployment');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Rollback Initiated",
        description: `Rollback has been started with ID: ${data.deploymentId}`,
      });
      // Wait a moment then refresh the list
      setTimeout(() => {
        refetchDeployments();
      }, 1000);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to rollback deployment",
        variant: "destructive",
      });
    }
  });

  // Auto-select the first deployment when list loads and none is selected
  useEffect(() => {
    if (deployments.length > 0 && !selectedDeploymentId) {
      setSelectedDeploymentId(deployments[0].id);
    }
  }, [deployments, selectedDeploymentId]);

  // Force refresh deployments on initial load and set up periodic refresh
  useEffect(() => {
    // Initial fetch
    refetchDeployments();
    
    // Set up periodic refresh every 5 seconds
    const intervalId = setInterval(() => {
      refetchDeployments();
    }, 5000);
    
    return () => clearInterval(intervalId);
  }, [refetchDeployments]);

  // Format deployment summary for display
  const formatDeploymentSummary = (deployment: Deployment): string => {
    switch (deployment.type) {
      case 'file':
        return `File: ${deployment.ft || 'N/A'}/${deployment.file || 'N/A'} (${deployment.status})`;
      case 'sql':
        return `SQL: ${deployment.ft || 'N/A'}/${deployment.file || 'N/A'} (${deployment.status})`;
      case 'systemd':
        return `Systemd: ${deployment.operation || 'N/A'} ${deployment.service || 'N/A'} (${deployment.status})`;
      case 'command':
        return `Command: ${deployment.command ? `${deployment.command.substring(0, 30)}${deployment.command.length > 30 ? '...' : ''}` : 'N/A'} (${deployment.status})`;
      case 'rollback':
        return `Rollback: ${deployment.ft || 'N/A'}/${deployment.file || 'N/A'} (${deployment.status})`;
      default:
        return `${deployment.type} (${deployment.status})`;
    }
  };

  const handleClearLogs = (e: React.FormEvent) => {
    e.preventDefault(); // Prevent form submission which causes page reload
    
    if (clearDays < 0) {
      toast({
        title: "Invalid Input",
        description: "Days must be a positive number or zero to clear all",
        variant: "destructive",
      });
      return;
    }
    
    clearLogsMutation.mutate(clearDays);
  };

  const handleRollback = (deploymentId: string) => {
    if (window.confirm("Are you sure you want to rollback this deployment? This will restore the previous version of the file.")) {
      rollbackMutation.mutate(deploymentId);
    }
  };

  // Get deployment details safely with a fallback
  const getSelectedDeployment = (): Deployment | undefined => {
    if (!selectedDeploymentId) return undefined;
    return deployments.find(d => d.id === selectedDeploymentId);
  };

  // Safe access to deployment summary
  const getDeploymentSummary = (): string => {
    const deployment = getSelectedDeployment();
    if (!deployment) return "Select a deployment to view details";
    return formatDeploymentSummary(deployment);
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-[#F79B72] mb-4">Deployment History</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Deployment List */}
        <div className="space-y-4">
          <Card className="bg-[#EEEEEE]">
            <CardHeader className="pb-2">
              <CardTitle className="text-[#F79B72] text-lg">Recent Deployments</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[400px] overflow-y-auto">
                {isLoadingDeployments ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="h-8 w-8 animate-spin text-[#F79B72]" />
                  </div>
                ) : (
                  <div className="space-y-2">
                    {deployments.length === 0 ? (
                      <p className="text-[#2A4759] italic">No deployment history found</p>
                    ) : (
                      deployments.map((deployment) => (
                        <div 
                          key={deployment.id} 
                          className={`p-3 rounded-md cursor-pointer transition-colors ${
                            selectedDeploymentId === deployment.id 
                              ? 'bg-[#F79B72] text-[#2A4759]' 
                              : 'bg-[#2A4759] text-[#EEEEEE] hover:bg-[#2A4759]/80'
                          }`}
                          onClick={() => setSelectedDeploymentId(deployment.id)}
                        >
                          <div className="flex justify-between">
                            <div>
                              {formatDeploymentSummary(deployment)}
                            </div>
                            <div className="text-xs">
                              {new Date(deployment.timestamp * 1000).toLocaleString()}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
              
              <form onSubmit={handleClearLogs} className="mt-4 flex items-center space-x-2">
                <Label htmlFor="clear-days" className="text-[#F79B72]">Days to keep:</Label>
                <Input 
                  id="clear-days" 
                  type="number" 
                  value={clearDays} 
                  onChange={(e) => setClearDays(parseInt(e.target.value) || 0)}
                  className="w-20 bg-[#EEEEEE] border-[#2A4759] text-[#2A4759]"
                />
                <Button 
                  type="submit"
                  disabled={clearLogsMutation.isPending}
                  className="bg-[#F79B72] text-[#2A4759] hover:bg-[#F79B72]/80"
                >
                  {clearLogsMutation.isPending ? "Clearing..." : "Clear Logs"}
                </Button>
                <Button
                  type="button"
                  onClick={() => refetchDeployments()}
                  className="bg-[#2A4759] text-white hover:bg-[#2A4759]/80 ml-auto"
                >
                  Refresh
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
        
        {/* Deployment Details */}
        <div className="space-y-4">
          <LogDisplay 
            logs={deploymentLogs} 
            height="400px" 
            title={`Deployment Details - ${getDeploymentSummary()}`}
          />
          
          {selectedDeploymentId && getSelectedDeployment()?.type === 'file' && 
           getSelectedDeployment()?.status === 'success' && (
            <div className="flex justify-end">
              <Button 
                onClick={() => handleRollback(selectedDeploymentId)}
                disabled={rollbackMutation.isPending}
                className="bg-[#2A4759] text-white hover:bg-[#2A4759]/80"
              >
                {rollbackMutation.isPending ? "Rolling Back..." : "Rollback Deployment"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DeploymentHistory;
