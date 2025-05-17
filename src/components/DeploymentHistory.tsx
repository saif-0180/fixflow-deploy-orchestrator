
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Label } from '@/components/ui/label';
import LogDisplay from '@/components/LogDisplay';

const DeploymentHistory = () => {
  const [selectedDeployment, setSelectedDeployment] = useState<string | null>(null);
  const [deploymentLogs, setDeploymentLogs] = useState<string[]>([]);
  
  // Fetch deployment history
  const { data: deployments = [], isLoading } = useQuery({
    queryKey: ['deployment-history'],
    queryFn: async () => {
      const response = await fetch('/api/deployments/history');
      if (!response.ok) {
        throw new Error('Failed to fetch deployment history');
      }
      return response.json();
    }
  });

  // Fetch logs for a specific deployment
  const { refetch: fetchDeploymentLogs, isLoading: isLoadingLogs } = useQuery({
    queryKey: ['deployment-logs', selectedDeployment],
    queryFn: async () => {
      if (!selectedDeployment) return [];
      
      const response = await fetch(`/api/deployments/${selectedDeployment}/logs`);
      if (!response.ok) {
        throw new Error('Failed to fetch deployment logs');
      }
      
      const data = await response.json();
      setDeploymentLogs(data.logs);
      return data;
    },
    enabled: false, // Don't run automatically
  });

  const handleViewLogs = () => {
    if (selectedDeployment) {
      fetchDeploymentLogs();
    }
  };
  
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-[#2A4759] mb-4">Deployment History</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <Label htmlFor="deployment-select" className="text-[#2A4759]">Select Deployment</Label>
            <Select value={selectedDeployment || ''} onValueChange={setSelectedDeployment}>
              <SelectTrigger 
                id="deployment-select" 
                className="bg-[#EEEEEE] border-[#2A4759] text-[#2A4759]"
                disabled={isLoading}
              >
                <SelectValue placeholder="Select a deployment" className="text-[#2A4759]" />
              </SelectTrigger>
              <SelectContent className="bg-[#DDDDDD] border-[#2A4759] text-[#2A4759] max-h-80">
                {deployments.map((deployment: any) => (
                  <SelectItem 
                    key={deployment.id} 
                    value={deployment.id}
                    className={`text-[#2A4759] ${deployment.status === 'success' ? 'border-l-2 border-green-500' : deployment.status === 'failed' ? 'border-l-2 border-red-500' : ''}`}
                  >
                    <div>
                      <span className="font-medium">{deployment.type}</span> - 
                      <span className={`ml-2 ${deployment.status === 'success' ? 'text-green-500' : deployment.status === 'failed' ? 'text-red-500' : 'text-[#2A4759]'}`}>
                        {deployment.status}
                      </span>
                      <div className="text-xs text-[#2A4759]">{new Date(deployment.timestamp).toLocaleString()}</div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button 
            onClick={handleViewLogs} 
            className="bg-[#F79B72] text-[#2A4759] hover:bg-[#F79B72]/80"
            disabled={!selectedDeployment || isLoadingLogs}
          >
            {isLoadingLogs ? "Loading..." : "View Logs"}
          </Button>
        </div>

        <div className="h-full">
          <LogDisplay logs={deploymentLogs} height="400px" title="Deployment Logs" />
        </div>
      </div>
    </div>
  );
};

export default DeploymentHistory;
