
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import LogDisplay from './LogDisplay';
import { Clock, CheckCircle, XCircle, Loader2 } from 'lucide-react';

interface Deployment {
  id: string;
  type: string;
  file?: string;
  command?: string;
  hostname?: string;
  vm?: string;
  status: string;
  timestamp: number;
  logs: string[];
}

type StatusVariant = "default" | "secondary" | "destructive" | "outline";

const getStatusVariant = (status: string): StatusVariant => {
  switch (status) {
    case 'running':
      return "secondary";
    case 'success':
      return "default";
    case 'failed':
      return "destructive";
    default:
      return "default";
  }
};

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'running':
      return <Loader2 className="h-4 w-4 animate-spin" />;
    case 'success':
      return <CheckCircle className="h-4 w-4" />;
    case 'failed':
      return <XCircle className="h-4 w-4" />;
    default:
      return null;
  }
};

const fetchDeployments = async (): Promise<Deployment[]> => {
  const response = await fetch('/api/deployments');
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.json();
};

export const DeploymentHistory = () => {
  const { isLoading, error, data: deployments } = useQuery<Deployment[], Error>({
    queryKey: ['deployments'],
    queryFn: fetchDeployments,
    refetchInterval: 5000, // Poll every 5 seconds
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Clock className="h-5 w-5" />
            <span>Recent Deployments</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin" />
              <span className="ml-2">Loading deployments...</span>
            </div>
          ) : error ? (
            <div className="text-red-500 p-4">
              Error loading deployments: {error.message}
            </div>
          ) : !deployments || deployments.length === 0 ? (
            <div className="text-gray-500 text-center p-8">
              No deployments found
            </div>
          ) : (
            <div className="space-y-4">
              {deployments.map((deployment) => (
                <Card key={deployment.id} className="border-l-4 border-l-blue-500">
                  <CardContent className="p-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                      <div>
                        <label className="text-sm font-medium text-gray-500">Type</label>
                        <p className="text-sm">{deployment.type}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-500">File/Command</label>
                        <p className="text-sm truncate" title={deployment.file || deployment.command}>
                          {deployment.file || deployment.command || 'N/A'}
                        </p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-500">Target</label>
                        <p className="text-sm">
                          {deployment.hostname || deployment.vm || 'N/A'}
                        </p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-500">Status</label>
                        <Badge variant={getStatusVariant(deployment.status)} className="ml-2">
                          {getStatusIcon(deployment.status)}
                          <span className="ml-1">{deployment.status}</span>
                        </Badge>
                      </div>
                    </div>
                    
                    <div className="mt-4">
                      <LogDisplay
                        logs={deployment.logs || []}
                        height="300px"
                        title={`Deployment ${deployment.id}`}
                        status={deployment.status as "loading" | "idle" | "running" | "success" | "failed" | "completed"}
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default DeploymentHistory;
