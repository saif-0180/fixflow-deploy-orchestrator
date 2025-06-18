import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RefreshCw, Clock, CheckCircle, XCircle, AlertCircle, Eye } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import LogDisplay from "./LogDisplay";

interface Deployment {
  id: string;
  timestamp: string;
  status: 'pending' | 'running' | 'success' | 'failed';
  logs?: string[];
  errorLogs?: string[];
  version?: string;
}

type StatusColorMap = {
  [key in Deployment['status']]: string;
};

const statusColorMap: StatusColorMap = {
  pending: 'bg-gray-400 text-gray-800',
  running: 'bg-blue-500 text-white',
  success: 'bg-green-500 text-white',
  failed: 'bg-red-500 text-white',
};

const DeploymentHistory = () => {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [selectedDeployment, setSelectedDeployment] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchDeployments = async (): Promise<Deployment[]> => {
    const res = await fetch('/api/deployments');
    if (!res.ok) {
      throw new Error('Failed to fetch deployments');
    }
    return res.json();
  };

  const {
    data: fetchedDeployments,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['deployments'],
    queryFn: fetchDeployments,
    initialData: [],
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchInterval: false,
  });

  useEffect(() => {
    if (fetchedDeployments) {
      setDeployments(fetchedDeployments);
    }
  }, [fetchedDeployments]);

  const handleViewLogs = (id: string) => {
    setSelectedDeployment(id);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refetch();
      toast.success("Deployment history refreshed!");
    } catch (error: any) {
      toast.error(`Failed to refresh deployments: ${error.message}`);
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header and Controls */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-[#EEEEEE]">Deployment History</h2>
        <Button
          variant="outline"
          className="bg-[#F79B72] text-[#2A4759] hover:bg-[#e68a61] disabled:bg-gray-500 disabled:text-gray-300"
          onClick={handleRefresh}
          disabled={isLoading || isRefreshing}
        >
          {isRefreshing || isLoading ? (
            <>
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              Refreshing...
            </>
          ) : (
            <>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </>
          )}
        </Button>
      </div>
      
      {/* Deployment List */}
      <div className="grid gap-4">
        {deployments.map((deployment) => (
          <Card key={deployment.id} className="bg-[#2A4759] border-[#F79B72]/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-[#EEEEEE]">
                Deployment #{deployment.id}
              </CardTitle>
              <div className="flex items-center space-x-2">
                <Badge className={statusColorMap[deployment.status]}>
                  {deployment.status === 'pending' && <Clock className="mr-2 h-4 w-4" />}
                  {deployment.status === 'running' && <Activity className="mr-2 h-4 w-4 animate-spin" />}
                  {deployment.status === 'success' && <CheckCircle className="mr-2 h-4 w-4" />}
                  {deployment.status === 'failed' && <XCircle className="mr-2 h-4 w-4" />}
                  {deployment.status}
                </Badge>
                <Button
                  variant="ghost"
                  className="h-8 w-8 p-0 text-[#EEEEEE] hover:bg-[#F79B72]/10"
                  onClick={() => handleViewLogs(deployment.id)}
                >
                  <Eye className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            
            <CardContent className="space-y-4">
              <div className="text-sm text-muted-foreground">
                <span className="font-bold text-[#EEEEEE]">Timestamp:</span> {deployment.timestamp}
              </div>
              {deployment.version && (
                <div className="text-sm text-muted-foreground">
                  <span className="font-bold text-[#EEEEEE]">Version:</span> {deployment.version}
                </div>
              )}
              
              {/* Logs Section */}
              {selectedDeployment === deployment.id && (
                <div className="space-y-4">
                  <Tabs defaultValue="execution" className="w-full">
                    <TabsList className="bg-[#2A4759] border-b border-[#F79B72]/20">
                      <TabsTrigger value="execution" className="data-[state=active]:bg-[#F79B72] data-[state=active]:text-[#2A4759] text-[#EEEEEE]">
                        Execution Logs
                      </TabsTrigger>
                      <TabsTrigger value="error" className="data-[state=active]:bg-[#F79B72] data-[state=active]:text-[#2A4759] text-[#EEEEEE]">
                        Error Logs
                      </TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="execution">
                      <LogDisplay
                        logs={deployment.logs || []}
                        height="300px"
                        title="Execution Logs"
                        status={deployment.status}
                      />
                    </TabsContent>
                    
                    <TabsContent value="error">
                      <LogDisplay
                        logs={deployment.errorLogs || []}
                        height="300px"
                        title="Error Logs"
                        status={deployment.status}
                      />
                    </TabsContent>
                  </Tabs>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      
      {/* No Deployments Message */}
      {deployments.length === 0 && !isLoading && !isRefreshing && (
        <div className="text-center text-gray-500">
          <AlertCircle className="mx-auto h-6 w-6 mb-2" />
          No deployments found.
        </div>
      )}
    </div>
  );
};

export default DeploymentHistory;
