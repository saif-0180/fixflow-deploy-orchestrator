
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import LogDisplay from './LogDisplay';
import TemplateFlowchart from './TemplateFlowchart';

interface DeploymentStep {
  type: string;
  description: string;
  order: number;
  [key: string]: any;
}

interface DeploymentTemplate {
  metadata: {
    ft_number: string;
    generated_at: string;
    description: string;
    selectedFiles?: string[];
    selectedVMs?: string[];
    dbConnection?: string;
    dbUser?: string;
    targetUser?: string;
    service?: string;
  };
  steps: DeploymentStep[];
  dependencies: Array<{
    step: number;
    depends_on: number[];
    parallel: boolean;
  }>;
}

const DeployUsingTemplate: React.FC = () => {
  const [selectedFt, setSelectedFt] = useState('');
  const [loadedTemplate, setLoadedTemplate] = useState<DeploymentTemplate | null>(null);
  const [deploymentId, setDeploymentId] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [deploymentStatus, setDeploymentStatus] = useState<'idle' | 'loading' | 'running' | 'success' | 'failed'>('idle');
  const { toast } = useToast();

  // Fetch available templates
  const { data: availableTemplates = [], isLoading: isLoadingTemplates } = useQuery({
    queryKey: ['available-templates'],
    queryFn: async () => {
      const response = await fetch('/api/templates/list');
      if (!response.ok) {
        throw new Error('Failed to fetch templates');
      }
      return response.json();
    },
    refetchInterval: 30000,
  });

  // Load specific template
  const loadTemplateMutation = useMutation({
    mutationFn: async (ftNumber: string) => {
      const response = await fetch(`/api/templates/${ftNumber}`);
      if (!response.ok) {
        throw new Error('Failed to load template');
      }
      return response.json();
    },
    onSuccess: (template) => {
      setLoadedTemplate(template);
      toast({
        title: "Success",
        description: `Template for ${selectedFt} loaded successfully`,
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to load template: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive",
      });
    },
  });

  // Deploy using template with enhanced logging
  const deployMutation = useMutation({
    mutationFn: async (template: DeploymentTemplate) => {
      console.log('Starting template deployment:', template.metadata.ft_number);
      setLogs(prev => [...prev, `Starting template deployment for ${template.metadata.ft_number}...`]);
      setDeploymentStatus('loading');
      
      const response = await fetch('/api/deploy/template', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ft_number: template.metadata.ft_number,
          template: template
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.text();
        console.error('Template deployment failed:', errorData);
        throw new Error(`Failed to start template deployment: ${errorData}`);
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      console.log('Template deployment started successfully:', data);
      setDeploymentId(data.deploymentId);
      setDeploymentStatus('running');
      setLogs(prev => [...prev, `Template deployment initiated with ID: ${data.deploymentId}`]);
      toast({
        title: "Deployment Started",
        description: `Template deployment initiated with ID: ${data.deploymentId}`,
      });
    },
    onError: (error) => {
      console.error('Template deployment error:', error);
      setDeploymentStatus('failed');
      setLogs(prev => [...prev, `ERROR: ${error instanceof Error ? error.message : 'Unknown error'}`]);
      toast({
        title: "Deployment Failed",
        description: `Failed to start deployment: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive",
      });
    },
  });

  // Fetch deployment logs with enhanced polling
  const { data: deploymentLogs } = useQuery({
    queryKey: ['template-deployment-logs', deploymentId],
    queryFn: async () => {
      if (!deploymentId) return { logs: [], status: 'idle' };
      
      console.log('Fetching deployment logs for:', deploymentId);
      const response = await fetch(`/api/deploy/template/${deploymentId}/logs`);
      if (!response.ok) {
        console.error('Failed to fetch deployment logs:', await response.text());
        throw new Error('Failed to fetch deployment logs');
      }
      const data = await response.json();
      console.log('Received deployment logs:', data);
      return data;
    },
    enabled: !!deploymentId && deploymentStatus === 'running',
    refetchInterval: (data) => {
      // Stop polling if deployment is complete
      const status = data?.status;
      return (status === 'running' || status === 'loading') ? 2000 : false;
    },
    refetchIntervalInBackground: true,
  });

  // Update logs and status from API with better handling
  useEffect(() => {
    if (deploymentLogs) {
      console.log('Updating logs from API:', deploymentLogs);
      
      // Only update if we have new logs
      if (deploymentLogs.logs && Array.isArray(deploymentLogs.logs)) {
        setLogs(deploymentLogs.logs);
      }
      
      // Update status
      if (deploymentLogs.status) {
        const newStatus = deploymentLogs.status;
        console.log('Updating deployment status to:', newStatus);
        setDeploymentStatus(newStatus);
        
        // Show completion notification
        if (newStatus === 'success') {
          toast({
            title: "Deployment Completed",
            description: "Template deployment completed successfully!",
          });
        } else if (newStatus === 'failed') {
          toast({
            title: "Deployment Failed",
            description: "Template deployment failed. Check logs for details.",
            variant: "destructive",
          });
        }
      }
    }
  }, [deploymentLogs, toast]);

  const handleLoadTemplate = () => {
    if (!selectedFt) {
      toast({
        title: "Error",
        description: "Please select an FT number",
        variant: "destructive",
      });
      return;
    }
    console.log('Loading template for:', selectedFt);
    loadTemplateMutation.mutate(selectedFt);
  };

  const handleDeploy = () => {
    if (!loadedTemplate) {
      toast({
        title: "Error",
        description: "Please load a template first",
        variant: "destructive",
      });
      return;
    }
    
    console.log('Starting deployment with template:', loadedTemplate);
    // Reset logs and status for new deployment
    setLogs([]);
    setDeploymentId(null);
    deployMutation.mutate(loadedTemplate);
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-[#F79B72] mb-4">Deploy using Template</h2>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left Column - Template Selection and Controls */}
        <div className="xl:col-span-1 space-y-6">
          <Card className="bg-[#1a2b42] text-[#EEEEEE] border-2 border-[#EEEEEE]/30">
            <CardHeader>
              <CardTitle className="text-[#F79B72]">Template Selection</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="ft-select" className="text-[#F79B72]">Select FT</Label>
                <Select value={selectedFt} onValueChange={setSelectedFt}>
                  <SelectTrigger id="ft-select" className="bg-[#2A4759] text-[#EEEEEE] border-[#EEEEEE]/30">
                    <SelectValue placeholder={isLoadingTemplates ? "Loading..." : "Select an FT"} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableTemplates.map((ft: string) => (
                      <SelectItem key={ft} value={ft}>{ft}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                onClick={handleLoadTemplate}
                disabled={!selectedFt || loadTemplateMutation.isPending}
                className="w-full bg-[#2A4759] text-[#EEEEEE] hover:bg-[#2A4759]/80 border-[#EEEEEE]/30"
              >
                {loadTemplateMutation.isPending ? "Loading Template..." : "Load Template"}
              </Button>

              {loadedTemplate && (
                <div className="mt-4 p-3 bg-[#2A4759]/50 rounded-md">
                  <h4 className="text-[#F79B72] font-medium mb-2">Template Info</h4>
                  <div className="text-sm text-[#EEEEEE] space-y-1">
                    <div>FT: {loadedTemplate.metadata.ft_number}</div>
                    <div>Steps: {loadedTemplate.steps.length}</div>
                    <div>Generated: {new Date(loadedTemplate.metadata.generated_at).toLocaleString()}</div>
                    {loadedTemplate.metadata.selectedVMs && (
                      <div>VMs: {loadedTemplate.metadata.selectedVMs.join(', ')}</div>
                    )}
                    {loadedTemplate.metadata.targetUser && (
                      <div>Target User: {loadedTemplate.metadata.targetUser}</div>
                    )}
                  </div>
                </div>
              )}

              <Button
                onClick={handleDeploy}
                disabled={!loadedTemplate || deployMutation.isPending || deploymentStatus === 'running'}
                className="w-full bg-[#F79B72] text-[#2A4759] hover:bg-[#F79B72]/80"
              >
                {deployMutation.isPending || deploymentStatus === 'running' ? "Deploying..." : "Deploy"}
              </Button>

              {deploymentStatus !== 'idle' && (
                <div className="mt-4 p-3 bg-[#2A4759]/50 rounded-md">
                  <div className="text-sm text-[#EEEEEE]">
                    <div>Status: <span className={`font-medium ${
                      deploymentStatus === 'success' ? 'text-green-400' : 
                      deploymentStatus === 'failed' ? 'text-red-400' : 
                      deploymentStatus === 'running' ? 'text-yellow-400' : 'text-gray-400'
                    }`}>
                      {deploymentStatus.toUpperCase()}
                    </span></div>
                    {deploymentId && <div>ID: {deploymentId}</div>}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Middle Column - Flowchart */}
        <div className="xl:col-span-1">
          <Card className="bg-[#1a2b42] text-[#EEEEEE] border-2 border-[#EEEEEE]/30 h-full">
            <CardHeader>
              <CardTitle className="text-[#F79B72]">Deployment Flow</CardTitle>
            </CardHeader>
            <CardContent>
              {loadedTemplate ? (
                <TemplateFlowchart template={loadedTemplate} />
              ) : (
                <div className="flex items-center justify-center h-[500px] text-[#EEEEEE]/50">
                  Load a template to see the deployment flow
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Enhanced Logs */}
        <div className="xl:col-span-1">
          <LogDisplay
            logs={logs}
            height="838px"
            fixedHeight={true}
            title="Template Deployment Logs"
            status={deploymentStatus}
          />
        </div>
      </div>
    </div>
  );
};

export default DeployUsingTemplate;
