
import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import LogDisplay from '@/components/LogDisplay';
import logger from '@/utils/logger';

interface Deployment {
  id: string;
  type: 'file' | 'sql' | 'systemd' | 'command';
  status: 'running' | 'success' | 'failed';
  timestamp: string;
  ft?: string;
  file?: string;
  vms?: string[];
  service?: string;
  operation?: string;
  command?: string;
  logs?: string[];
}

const DeploymentHistory: React.FC = () => {
  const { toast } = useToast();
  const [selectedDeploymentId, setSelectedDeploymentId] = useState<string | null>(null);
  const [deploymentLogs, setDeploymentLogs] = useState<string[]>([]);
  const [clearDays, setClearDays] = useState<number>(30);

  // Fetch deployment history
  const { data: deployments = [], refetch: refetchDeployments } = useQuery({
    queryKey: ['deployment-history'],
    queryFn: async () => {
      logger.info('Fetching deployment history');
      const response = await fetch('/api/deployments/history');
      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`Failed to fetch deployment history: ${errorText}`);
        throw new Error('Failed to fetch deployment history');
      }
      return response.json() as Promise<Deployment[]>;
    }
  });

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
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Fetch logs for selected deployment
  useEffect(() => {
    if (!selectedDeploymentId) {
      setDeploymentLogs([]);
      return;
    }
    
    const fetchLogs = async () => {
      logger.info(`Fetching logs for deployment: ${selectedDeploymentId}`);
      try {
        const response = await fetch(`/api/deploy/${selectedDeploymentId}/logs`);
        if (!response.ok) {
          toast({
            title: "Error",
            description: "Failed to fetch logs for this deployment",
            variant: "destructive",
          });
          return;
        }
        
        const data = await response.json();
        setDeploymentLogs(data.logs || []);
      } catch (error) {
        logger.error(`Error fetching logs: ${error}`);
        toast({
          title: "Error",
          description: "Failed to fetch logs",
          variant: "destructive",
        });
      }
    };
    
    fetchLogs();
  }, [selectedDeploymentId, toast]);

  // Extract selected deployment for display
  const selectedDeployment = selectedDeploymentId 
    ? deployments.find(d => d.id === selectedDeploymentId) 
    : null;

  const formatDeploymentSummary = (deployment: Deployment): string => {
    switch (deployment.type) {
      case 'file':
        return `File: ${deployment.ft}/${deployment.file} (${deployment.status})`;
      case 'sql':
        return `SQL: ${deployment.ft}/${deployment.file} (${deployment.status})`;
      case 'systemd':
        return `Systemd: ${deployment.operation} ${deployment.service} (${deployment.status})`;
      case 'command':
        return `Command: ${deployment.command?.substring(0, 30)}${deployment.command && deployment.command.length > 30 ? '...' : ''} (${deployment.status})`;
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

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-[#F79B72] mb-4">Deployment History</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Deployment List */}
        <div className="space-y-4">
          <Card className="bg-[#EEEEEE]">
            <CardHeader className="pb-2">
              <CardTitle className="text-[#2A4759] text-lg">Recent Deployments</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[400px] overflow-y-auto">
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
                            {new Date(deployment.timestamp).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
              
              <div className="mt-4 flex items-center space-x-2">
                <Label htmlFor="clear-days" className="text-[#F79B72]">Days to keep:</Label>
                <Input 
                  id="clear-days" 
                  type="number" 
                  value={clearDays} 
                  onChange={(e) => setClearDays(parseInt(e.target.value) || 0)}
                  className="w-20 bg-[#EEEEEE] border-[#2A4759] text-[#2A4759]"
                />
                <Button 
                  onClick={handleClearLogs} 
                  disabled={clearLogsMutation.isPending}
                  className="bg-[#F79B72] text-[#2A4759] hover:bg-[#F79B72]/80"
                >
                  {clearLogsMutation.isPending ? "Clearing..." : "Clear Logs"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
        
        {/* Deployment Details */}
        <div>
          <LogDisplay 
            logs={selectedDeployment?.logs || deploymentLogs} 
            height="480px" 
            title={selectedDeployment 
              ? `Deployment Details - ${formatDeploymentSummary(selectedDeployment)}` 
              : "Select a deployment to view details"
            } 
          />
        </div>
      </div>
    </div>
  );
};

export default DeploymentHistory;
