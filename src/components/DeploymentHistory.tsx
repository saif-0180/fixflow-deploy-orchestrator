
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
      <h2 className="text-xl font-semibold text-[#F97316]">Deployment History</h2>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        <div className="md:col-span-5 space-y-4">
          <div>
            <Label htmlFor="deployment-select">Select Deployment</Label>
            <Select value={selectedDeployment || ''} onValueChange={setSelectedDeployment}>
              <SelectTrigger 
                id="deployment-select" 
                className="bg-[#333333] border-gray-700"
                disabled={isLoading}
              >
                <SelectValue placeholder="Select a deployment" />
              </SelectTrigger>
              <SelectContent className="bg-[#333333] border-gray-700 max-h-80">
                {deployments.map((deployment: any) => (
                  <SelectItem 
                    key={deployment.id} 
                    value={deployment.id}
                    className={`${deployment.status === 'success' ? 'border-l-2 border-green-500' : deployment.status === 'failed' ? 'border-l-2 border-red-500' : ''}`}
                  >
                    <div>
                      <span className="font-medium">{deployment.type}</span> - 
                      <span className={`ml-2 ${deployment.status === 'success' ? 'text-green-500' : deployment.status === 'failed' ? 'text-red-500' : 'text-gray-400'}`}>
                        {deployment.status}
                      </span>
                      <div className="text-xs text-gray-400">{new Date(deployment.timestamp).toLocaleString()}</div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button 
            onClick={handleViewLogs} 
            className="bg-[#F97316] text-black hover:bg-orange-400"
            disabled={!selectedDeployment || isLoadingLogs}
          >
            {isLoadingLogs ? "Loading..." : "View Logs"}
          </Button>
        </div>

        <div className="md:col-span-7">
          <LogDisplay logs={deploymentLogs} height="500px" />
        </div>
      </div>
    </div>
  );
};

export default DeploymentHistory;
