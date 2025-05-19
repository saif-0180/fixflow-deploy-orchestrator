import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import LogDisplay from '@/components/LogDisplay';
import logger from '@/utils/logger';
import { Loader2 } from 'lucide-react';

interface Deployment {
  id: string;
  type: 'file' | 'sql' | 'systemd' | 'command' | 'rollback';
  status: 'running' | 'success' | 'failed';
  timestamp: string;
  ft?: string;
  file?: string;
  vms?: string[];
  service?: string;
  operation?: string;
  command?: string;
  logs?: string[];
  original_deployment?: string; // For rollback operations
}

const DeploymentHistory: React.FC = () => {
  const { toast } = useToast();
  const [selectedDeploymentId, setSelectedDeploymentId] = useState<string | null>(null);
  const [deploymentLogs, setDeploymentLogs] = useState<string[]>([]);
  const [clearDays, setClearDays] = useState<number>(30);
  
  // Fetch deployment history
  const { data: deployments = [], refetch: refetchDeployments, isLoading: isLoadingDeployments } = useQuery({
    queryKey: ['deployment-history'],
    queryFn: async () => {
      logger.info('Fetching deployment history');
      try {
        const response = await fetch('/api/deployments/history');
        if (!response.ok) {
          const errorText = await response.text();
          logger.error(`Failed to fetch deployment history: ${errorText}`);
          throw new Error('Failed to fetch deployment history');
        }
        const data = await response.json();
        return data as Deployment[];
      } catch (error) {
        logger.error(`Error in history fetch: ${error}`);
        throw error;
      }
    }
  });

  // Fetch logs for selected deployment
  const { isLoading: isLoadingLogs, refetch: refetchLogs } = useQuery({
    queryKey: ['deployment-logs', selectedDeploymentId],
    queryFn: async () => {
      if (!selectedDeploymentId) {
        return { logs: [] };
      }
      
      logger.info(`Fetching logs for deployment: ${selectedDeploymentId}`);
      try {
        const response = await fetch(`/api/deploy/${selectedDeploymentId}/logs`);
        if (!response.ok) {
          const errorText = await response.text();
          logger.error(`Failed to fetch logs: ${errorText}`);
          throw new Error('Failed to fetch logs');
        }
        return await response.json();
      } catch (error) {
        logger.error(`Error fetching logs: ${error}`);
        throw error;
      }
    },
    enabled: !!selectedDeploymentId,
    meta: {
      onSuccess: (data: any) => {
        if (data.logs && data.logs.length > 0) {
          setDeploymentLogs(data.logs);
        } else {
          // If no logs in response, check if the selected deployment has logs
          const selectedDeployment = deployments.find(d => d.id === selectedDeploymentId);
          if (selectedDeployment?.logs && selectedDeployment.logs.length > 0) {
            setDeploymentLogs(selectedDeployment.logs);
          } else {
            setDeploymentLogs(["No logs available for this deployment"]);
          }
        }
      },
      onError: () => {
        toast({
          title: "Error",
          description: "Failed to fetch logs for this deployment",
          variant: "destructive",
        });
        setDeploymentLogs(["Error loading logs. Please try again."]);
      }
    }
  });

  // Use effect to handle success and error cases for the logs query
  useEffect(() => {
    if (selectedDeploymentId) {
      refetchLogs().then((result) => {
        if (result.isSuccess && result.data) {
          if (result.data.logs && result.data.logs.length > 0) {
            setDeploymentLogs(result.data.logs);
          } else {
            // If no logs in response, check if the selected deployment has logs
            const selectedDeployment = deployments.find(d => d.id === selectedDeploymentId);
            if (selectedDeployment?.logs && selectedDeployment.logs.length > 0) {
              setDeploymentLogs(selectedDeployment.logs);
            } else {
              setDeploymentLogs(["No logs available for this deployment"]);
            }
          }
        } else if (result.isError) {
          toast({
            title: "Error",
            description: "Failed to fetch logs for this deployment",
            variant: "destructive",
          });
          setDeploymentLogs(["Error loading logs. Please try again."]);
        }
      });
    }
  }, [selectedDeploymentId, deployments, refetchLogs, toast]);

  // Clear logs mutation
  const clearLogsMutation = useMutation({
    mutationFn: async (days: number) => {
      logger.info(`Clearing deployment logs older than ${days} days`);
      const response = await fetch('/api/deployments/clear', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ days }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`Failed to clear logs: ${errorText}`);
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
      logger.info(`Rolling back deployment: ${deploymentId}`);
      const response = await fetch(`/api/deploy/${deploymentId}/rollback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`Failed to rollback: ${errorText}`);
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

  // Force refresh deployments on initial load
  useEffect(() => {
    refetchDeployments();
    // Set up periodic refresh every 10 seconds
    const intervalId = setInterval(() => {
      refetchDeployments();
    }, 10000);
    
    return () => clearInterval(intervalId);
  }, [refetchDeployments]);

  // Extract selected deployment for display
  const selectedDeployment = selectedDeploymentId 
    ? deployments.find(d => d.id === selectedDeploymentId) 
    : null;

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

  const handleClearLogs = () => {
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

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-[#F79B72] mb-4">Deployment History</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Deployment List */}
        <div className="space-y-4">
          <Card className="bg-[#1a2b42]">
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
                      <p className="text-[#EEEEEE] italic">No deployment history found</p>
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
                              {new Date(deployment.timestamp).toLocaleString()}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
              
              <div className="mt-4 flex items-center space-x-2">
                <Label htmlFor="clear-days" className="text-[#F79B72]">Days to keep:</Label>
                <Input 
                  id="clear-days" 
                  type="number" 
                  value={clearDays} 
                  onChange={(e) => setClearDays(parseInt(e.target.value) || 0)}
                  className="w-20 bg-[#1a2b42] border-[#EEEEEE] text-[#EEEEEE]"
                />
                <Button 
                  onClick={handleClearLogs} 
                  disabled={clearLogsMutation.isPending}
                  className="bg-[#F79B72] text-[#2A4759] hover:bg-[#F79B72]/80"
                >
                  {clearLogsMutation.isPending ? "Clearing..." : "Clear Logs"}
                </Button>
                <Button
                  onClick={() => refetchDeployments()}
                  className="bg-[#2A4759] text-white hover:bg-[#2A4759]/80 ml-auto"
                >
                  Refresh
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
        
        {/* Deployment Details */}
        <div className="space-y-4">
          <LogDisplay 
            logs={selectedDeployment?.logs || deploymentLogs} 
            height="400px" 
            title={selectedDeployment 
              ? `Deployment Details - ${formatDeploymentSummary(selectedDeployment)}` 
              : "Select a deployment to view details"
            } 
          />
          
          {selectedDeployment && selectedDeployment.type === 'file' && selectedDeployment.status === 'success' && (
            <div className="flex justify-end">
              <Button 
                onClick={() => handleRollback(selectedDeployment.id)}
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
