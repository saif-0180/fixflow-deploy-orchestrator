import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronRight, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

interface Deployment {
  id: string;
  timestamp: string;
  status: string;
  details: any;
  logs: string[];
}

interface DeploymentHistoryResponse {
  deployments: Deployment[];
}

type DeploymentStatus = "loading" | "idle" | "running" | "success" | "failed" | "completed";

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'completed':
    case 'success':
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case 'failed':
      return <XCircle className="h-4 w-4 text-red-500" />;
    case 'running':
      return <AlertCircle className="h-4 w-4 text-blue-500 animate-spin" />;
    case 'pending':
    case 'idle':
    case 'loading':
    default:
      return <Clock className="h-4 w-4 text-yellow-500" />;
  }
};

const getStatusColor = (status: string) => {
  switch (status) {
    case 'completed':
    case 'success':
      return 'bg-green-100 text-green-800';
    case 'failed':
      return 'bg-red-100 text-red-800';
    case 'running':
      return 'bg-blue-100 text-blue-800';
    case 'pending':
    case 'idle':
    case 'loading':
    default:
      return 'bg-yellow-100 text-yellow-800';
  }
};

const DeploymentHistory: React.FC = () => {
  const [expandedDeployment, setExpandedDeployment] = useState<string | null>(null);

  const { isLoading, error, data } = useQuery<DeploymentHistoryResponse>(
    ['deploymentHistory'],
    () =>
      fetch('/api/deployments').then((res) =>
        res.json()
      )
  );

  const normalizeStatus = (status: string): "loading" | "idle" | "running" | "success" | "failed" | "completed" => {
    const normalizedStatus = status.toLowerCase();
    switch (normalizedStatus) {
      case 'pending':
        return 'idle';
      case 'success':
        return 'completed';
      default:
        return normalizedStatus as "loading" | "idle" | "running" | "success" | "failed" | "completed";
    }
  };

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Deployment History</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[400px] w-full">
          {data?.deployments.map((deployment) => {
            const status = normalizeStatus(deployment.status);
            return (
              <Collapsible key={deployment.id} onOpenChange={(open) => open ? setExpandedDeployment(deployment.id) : setExpandedDeployment(null)} open={expandedDeployment === deployment.id}>
                <div className="border-b">
                  <div className="flex items-center justify-between p-4">
                    <div className="flex items-center space-x-2">
                      {getStatusIcon(status)}
                      <CardTitle className="text-sm font-medium">{deployment.timestamp}</CardTitle>
                    </div>
                    <Badge className={getStatusColor(status)}>{status}</Badge>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        {expandedDeployment === deployment.id ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                        <span className="sr-only">Toggle</span>
                      </Button>
                    </CollapsibleTrigger>
                  </div>
                  <CollapsibleContent className="px-4 pb-4">
                    <pre className="font-mono text-sm">
                      {deployment.logs && deployment.logs.length > 0 ? (
                        deployment.logs.map((log, index) => (
                          <div key={index}>{log}</div>
                        ))
                      ) : (
                        <div>No logs available for this deployment.</div>
                      )}
                    </pre>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            );
          })}
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default DeploymentHistory;
