import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Label } from '@/components/ui/label';
import { useToast } from "@/hooks/use-toast";
import LogDisplay from '@/components/LogDisplay';

const DeploymentHistory = () => {
  const { toast } = useToast();
  const [selectedDeployment, setSelectedDeployment] = useState<string | null>(null);
  const [deploymentLogs, setDeploymentLogs] = useState<string[]>([]);
  const [clearDays, setClearDays] = useState<number>(7);
  
  // Fetch deployment history
  const { data: deployments = [], isLoading, refetch: refetchDeployments } = useQuery({
    queryKey: ['deployment-history'],
    queryFn: async () => {
      // Try to get cached logs first
      let cachedLogs;
      try {
        const cachedLogsJson = localStorage.getItem('deployment-history');
        if (cachedLogsJson) {
          cachedLogs = JSON.parse(cachedLogsJson);
        }
      } catch (error) {
        console.error("Failed to parse cached logs:", error);
      }
      
      try {
        const response = await fetch('/api/deployments/history');
        if (!response.ok) {
          throw new Error('Failed to fetch deployment history');
        }
        const apiLogs = await response.json();
        
        // Merge API logs with cached logs if they exist
        if (cachedLogs && Array.isArray(cachedLogs)) {
          // Create a Set of IDs from API logs to avoid duplicates
          const apiLogIds = new Set(apiLogs.map((log: any) => log.id));
          
          // Add cached logs that aren't in the API response
          const uniqueCachedLogs = cachedLogs.filter(
            (log: any) => !apiLogIds.has(log.id)
          );
          
          // Combine both sets of logs
          const combinedLogs = [...apiLogs, ...uniqueCachedLogs];
          
          // Sort by timestamp, most recent first
          combinedLogs.sort((a: any, b: any) => 
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          );
          
          // Cache the combined logs
          localStorage.setItem('deployment-history', JSON.stringify(combinedLogs));
          
          return combinedLogs;
        }
        
        // No cached logs, just use API logs
        localStorage.setItem('deployment-history', JSON.stringify(apiLogs));
        return apiLogs;
      } catch (error) {
        console.error("API request failed:", error);
        // If API request fails, use cached logs if they exist
        if (cachedLogs && Array.isArray(cachedLogs)) {
          return cachedLogs;
        }
        // Otherwise return empty array
        return [];
      }
    }
  });

  // Fetch logs for a specific deployment
  const { refetch: fetchDeploymentLogs, isLoading: isLoadingLogs } = useQuery({
    queryKey: ['deployment-logs', selectedDeployment],
    queryFn: async () => {
      if (!selectedDeployment) return [];
      
      // Try to get cached logs for this deployment
      let cachedLogs;
      try {
        const cachedLogsJson = localStorage.getItem(`deployment-logs-${selectedDeployment}`);
        if (cachedLogsJson) {
          cachedLogs = JSON.parse(cachedLogsJson);
        }
      } catch (error) {
        console.error("Failed to parse cached logs:", error);
      }
      
      try {
        const response = await fetch(`/api/deployments/${selectedDeployment}/logs`);
        if (!response.ok) {
          throw new Error('Failed to fetch deployment logs');
        }
        
        const data = await response.json();
        setDeploymentLogs(data.logs);
        
        // Cache these logs
        localStorage.setItem(`deployment-logs-${selectedDeployment}`, JSON.stringify(data.logs));
        
        return data;
      } catch (error) {
        console.error("API request failed:", error);
        // If API request fails, use cached logs if they exist
        if (cachedLogs) {
          setDeploymentLogs(cachedLogs);
          return { logs: cachedLogs };
        }
        
        // Otherwise return empty logs
        setDeploymentLogs([]);
        return { logs: [] };
      }
    },
    enabled: false, // Don't run automatically
  });

  const handleViewLogs = () => {
    if (selectedDeployment) {
      fetchDeploymentLogs();
    }
  };

  // Clear logs mutation
  const clearLogsMutation = useMutation({
    mutationFn: async () => {
      // Only clear logs from local storage older than clearDays
      try {
        // Get cached deployment history
        const cachedLogsJson = localStorage.getItem('deployment-history');
        if (!cachedLogsJson) return;
        
        const cachedLogs = JSON.parse(cachedLogsJson);
        const currentDate = new Date();
        const cutoffDate = new Date();
        cutoffDate.setDate(currentDate.getDate() - clearDays);
        
        // Filter logs to keep only those newer than the cutoff date
        const recentLogs = cachedLogs.filter((log: any) => 
          new Date(log.timestamp) > cutoffDate
        );
        
        // Save the filtered logs
        localStorage.setItem('deployment-history', JSON.stringify(recentLogs));
        
        // Also clear any individual deployment logs that are too old
        cachedLogs.forEach((log: any) => {
          if (new Date(log.timestamp) <= cutoffDate) {
            localStorage.removeItem(`deployment-logs-${log.id}`);
          }
        });
        
        // Update the UI
        refetchDeployments();
        
        return true;
      } catch (error) {
        console.error("Failed to clear logs:", error);
        throw error;
      }
    },
    onSuccess: () => {
      toast({
        title: "Logs Cleared",
        description: `Logs older than ${clearDays} days have been cleared.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to Clear Logs",
        description: String(error),
        variant: "destructive",
      });
    },
  });
  
  const handleClearLogs = () => {
    clearLogsMutation.mutate();
  };

  // Set log retention options
  const logRetentionOptions = [
    { value: "7", label: "7 days" },
    { value: "14", label: "14 days" },
    { value: "30", label: "30 days" },
    { value: "90", label: "90 days" },
    { value: "365", label: "365 days" }
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-[#F79B72] mb-4">Deployment History</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4 bg-[#EEEEEE] p-4 rounded-md">
          <div>
            <Label htmlFor="deployment-select" className="text-[#F79B72]">Select Deployment</Label>
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

          <div className="pt-4 border-t border-gray-300">
            <h3 className="text-lg font-medium text-[#F79B72] mb-2">Log Management</h3>
            
            <div className="space-y-2">
              <Label htmlFor="clear-days" className="text-[#F79B72]">Retention Period</Label>
              <Select 
                value={clearDays.toString()} 
                onValueChange={(value) => setClearDays(parseInt(value))}
              >
                <SelectTrigger 
                  id="clear-days" 
                  className="bg-[#EEEEEE] border-[#2A4759] text-[#2A4759]"
                >
                  <SelectValue placeholder="Select retention period" className="text-[#2A4759]" />
                </SelectTrigger>
                <SelectContent className="bg-[#DDDDDD] border-[#2A4759] text-[#2A4759]">
                  {logRetentionOptions.map(option => (
                    <SelectItem 
                      key={option.value} 
                      value={option.value}
                      className="text-[#2A4759]"
                    >
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button 
              onClick={handleClearLogs}
              className="bg-[#2A4759] hover:bg-[#2A4759]/80 text-white mt-2"
              disabled={clearLogsMutation.isPending}
            >
              {clearLogsMutation.isPending ? "Clearing..." : `Clear Logs Older Than ${clearDays} Days`}
            </Button>
          </div>
        </div>

        <div>
          <LogDisplay logs={deploymentLogs} height="400px" fixedHeight={true} title="Deployment Logs" />
        </div>
      </div>
    </div>
  );
};

export default DeploymentHistory;
