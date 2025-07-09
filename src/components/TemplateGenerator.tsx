import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Plus, Download, Upload, RefreshCw, Save, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

// Step type interface
interface DeploymentStep {
  id: number;
  order: number;
  type: string;
  description: string;
  files: string[];
  targetVMs: string[];
  ftNumber: string;
  targetUser?: string;
  targetPath?: string;
  service?: string;
  helmDeploymentType?: string;
  sqlQuery?: string;
  dbConnection?: string;
  dbUser?: string;
}

const TemplateGenerator = () => {
  const { toast } = useToast();

  // Main template state
  const [ftNumber, setFtNumber] = useState('');
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState<DeploymentStep[]>([]);
  const [generatedTemplate, setGeneratedTemplate] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Form state for adding steps
  const [selectedOperationType, setSelectedOperationType] = useState('');
  const [stepDescription, setStepDescription] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [selectedVMs, setSelectedVMs] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState('');
  const [selectedVM, setSelectedVM] = useState('');
  const [targetUser, setTargetUser] = useState('');
  const [targetPath, setTargetPath] = useState('');
  const [selectedService, setSelectedService] = useState('');
  const [helmDeploymentType, setHelmDeploymentType] = useState('');
  const [sqlQuery, setSqlQuery] = useState('');
  const [dbConnection, setDbConnection] = useState('');
  const [dbUser, setDbUser] = useState('');

  // Saved templates state
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Fetch available FTs
  const { data: fts = [] } = useQuery({
    queryKey: ['fts'],
    queryFn: async () => {
      const response = await fetch('/api/fts');
      if (!response.ok) throw new Error('Failed to fetch FTs');
      return response.json();
    }
  });

  // Fetch files for selected FT
  const { data: files = [] } = useQuery({
    queryKey: ['files', ftNumber],
    queryFn: async () => {
      if (!ftNumber) return [];
      const response = await fetch(`/api/fts/${ftNumber}/files`);
      if (!response.ok) throw new Error('Failed to fetch files');
      return response.json();
    },
    enabled: !!ftNumber
  });

  // Fetch VMs
  const { data: vms = [] } = useQuery({
    queryKey: ['vms'],
    queryFn: async () => {
      const response = await fetch('/api/vms');
      if (!response.ok) throw new Error('Failed to fetch VMs');
      return response.json();
    }
  });

  // Fetch services
  const { data: services = [] } = useQuery({
    queryKey: ['services'],
    queryFn: async () => {
      const response = await fetch('/api/systemd/services');
      if (!response.ok) throw new Error('Failed to fetch services');
      return response.json();
    }
  });

  // Fetch helm types
  const { data: helmTypes = [] } = useQuery({
    queryKey: ['helm-types'],
    queryFn: async () => {
      const response = await fetch('/api/helm-upgrades');
      if (!response.ok) throw new Error('Failed to fetch helm types');
      return response.json();
    }
  });

  // Fetch DB connections
  const { data: dbConnections = [] } = useQuery({
    queryKey: ['db-connections'],
    queryFn: async () => {
      const response = await fetch('/api/db-inventory');
      if (!response.ok) throw new Error('Failed to fetch DB connections');
      const data = await response.json();
      return data.db_connections || [];
    }
  });

  // Fetch available templates
  const { data: availableTemplates = [], isLoading: isLoadingTemplates, refetch: refetchTemplates } = useQuery({
    queryKey: ['available-templates'],
    queryFn: async () => {
      const response = await fetch('/api/templates/list');
      if (!response.ok) throw new Error('Failed to fetch templates');
      return response.json();
    }
  });

  // Operation types with their default configurations
  const operationTypes = [
    { value: 'ansible_playbook', label: 'Ansible Playbook' },
    { value: 'helm_upgrade', label: 'Helm Upgrade' },
    { value: 'file_copy', label: 'File Copy' },
    { value: 'service_restart', label: 'Service Restart' },
    { value: 'sql_operations', label: 'SQL Operations' }
  ];

  // Reset form when operation type changes
  useEffect(() => {
    setSelectedFiles([]);
    setSelectedVMs([]);
    setTargetUser('');
    setTargetPath('');
    setSelectedService('');
    setHelmDeploymentType('');
    setSqlQuery('');
    setDbConnection('');
    setDbUser('');

    // Set default values based on operation type
    switch (selectedOperationType) {
      case 'ansible_playbook':
        setSelectedVMs(['batch1']);
        setTargetUser('infadm');
        break;
      case 'helm_upgrade':
        setSelectedVMs(['batch1']);
        setTargetUser('admin');
        break;
      case 'file_copy':
        setTargetUser('infadm');
        setTargetPath('/home/users/abpwrk1/pbin/app');
        break;
      case 'service_restart':
        setTargetUser('infadm');
        break;
      case 'sql_operations':
        setTargetUser('infadm');
        break;
    }
  }, [selectedOperationType]);

  const handleFileSelect = (file: string) => {
    if (file && !selectedFiles.includes(file)) {
      setSelectedFiles([...selectedFiles, file]);
      setSelectedFile('');
    }
  };

  const removeFile = (file: string) => {
    setSelectedFiles(selectedFiles.filter(f => f !== file));
  };

  const handleVMSelect = (vm: string) => {
    if (vm && !selectedVMs.includes(vm)) {
      setSelectedVMs([...selectedVMs, vm]);
      setSelectedVM('');
    }
  };

  const removeVM = (vm: string) => {
    setSelectedVMs(selectedVMs.filter(v => v !== vm));
  };

  const addStep = () => {
    if (!selectedOperationType || !stepDescription) {
      toast({
        title: "Missing Information",
        description: "Please select operation type and enter description",
        variant: "destructive"
      });
      return;
    }

    // Create step with only relevant fields based on operation type
    const baseStep: DeploymentStep = {
      id: Date.now(),
      order: steps.length + 1,
      type: selectedOperationType,
      description: stepDescription,
      files: selectedFiles,
      targetVMs: selectedVMs,
      ftNumber: ftNumber
    };

    // Add operation-specific fields
    const step = { ...baseStep };
    
    switch (selectedOperationType) {
      case 'ansible_playbook':
        // No additional fields needed
        break;
      case 'helm_upgrade':
        if (helmDeploymentType) step.helmDeploymentType = helmDeploymentType;
        break;
      case 'file_copy':
        if (targetUser) step.targetUser = targetUser;
        if (targetPath) step.targetPath = targetPath;
        break;
      case 'service_restart':
        if (selectedService) step.service = selectedService;
        break;
      case 'sql_operations':
        if (sqlQuery) step.sqlQuery = sqlQuery;
        if (dbConnection) step.dbConnection = dbConnection;
        if (dbUser) step.dbUser = dbUser;
        break;
    }

    setSteps([...steps, step]);
    
    // Reset form
    setStepDescription('');
    setSelectedFiles([]);
    setSelectedVMs([]);
    setTargetUser('');
    setTargetPath('');
    setSelectedService('');
    setHelmDeploymentType('');
    setSqlQuery('');
    setDbConnection('');
    setDbUser('');

    toast({
      title: "Step Added",
      description: `${selectedOperationType} step added successfully`
    });
  };

  const removeStep = (stepId: number) => {
    setSteps(steps.filter(step => step.id !== stepId));
  };

  const handleGenerateTemplate = () => {
    if (!ftNumber || steps.length === 0) {
      toast({
        title: "Missing Information",
        description: "Please enter FT number and add at least one step",
        variant: "destructive"
      });
      return;
    }

    const template = {
      metadata: {
        ft_number: ftNumber,
        generated_at: new Date().toISOString(),
        description: description || `Deployment template for ${ftNumber}`,
        selectedFiles: [...new Set(steps.flatMap(step => step.files))],
        selectedVMs: [...new Set(steps.flatMap(step => step.targetVMs))]
      },
      steps: steps.map(step => {
        const { id, ...stepWithoutId } = step;
        return stepWithoutId;
      }),
      dependencies: steps.map((_, index) => ({
        step: index + 1,
        depends_on: [],
        parallel: false
      }))
    };

    setGeneratedTemplate(template);
    toast({
      title: "Template Generated",
      description: `Template for ${ftNumber} generated successfully`
    });
  };

  const handleSaveTemplate = async () => {
    if (!generatedTemplate) return;

    setIsSaving(true);
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch('/api/templates/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          ft_number: generatedTemplate.metadata.ft_number,
          template: generatedTemplate
        })
      });

      if (!response.ok) {
        throw new Error('Failed to save template');
      }

      toast({
        title: "Template Saved",
        description: `Template ${generatedTemplate.metadata.ft_number} saved successfully`
      });

      // Refresh available templates
      await refetchTemplates();
    } catch (error) {
      toast({
        title: "Save Failed",
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleRefreshAvailableTemplates = async () => {
    setIsRefreshing(true);
    try {
      await refetchTemplates();
      toast({
        title: "Refreshed",
        description: "Available templates list updated"
      });
    } catch (error) {
      toast({
        title: "Refresh Failed",
        description: "Failed to refresh templates",
        variant: "destructive"
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleTemplateSelect = async (templateFt: string) => {
    try {
      const response = await fetch(`/api/templates/${templateFt}`);
      if (!response.ok) throw new Error('Failed to load template');
      
      const template = await response.json();
      setGeneratedTemplate(template);
      setFtNumber(template.metadata.ft_number);
      setDescription(template.metadata.description);
      setSteps(template.steps.map((step: any, index: number) => ({
        ...step,
        id: Date.now() + index
      })));

      toast({
        title: "Template Loaded",
        description: `Template ${templateFt} loaded successfully`
      });
    } catch (error) {
      toast({
        title: "Load Failed",
        description: "Failed to load template",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-[#F79B72] mb-4">Template Generator</h2>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Left column - Main form */}
        <div className="space-y-6">
          <Card className="bg-[#1a2b42] text-[#EEEEEE] border-2 border-[#EEEEEE]/30">
            <CardHeader>
              <CardTitle className="text-[#F79B72]">Template Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="ft-number" className="text-[#F79B72]">FT Number</Label>
                <Input
                  id="ft-number"
                  type="text"
                  value={ftNumber}
                  onChange={(e) => setFtNumber(e.target.value)}
                  placeholder="Enter FT number"
                  className="bg-[#2A4759] text-[#EEEEEE] border-[#EEEEEE]/30"
                />
              </div>

              <div>
                <Label htmlFor="template-description" className="text-[#F79B72]">Description</Label>
                <Input
                  id="template-description"
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Enter template description"
                  className="bg-[#2A4759] text-[#EEEEEE] border-[#EEEEEE]/30"
                />
              </div>

              <div>
                <Label className="text-[#F79B72]">Operation Type</Label>
                <Select value={selectedOperationType} onValueChange={setSelectedOperationType}>
                  <SelectTrigger className="bg-[#2A4759] text-[#EEEEEE] border-[#EEEEEE]/30">
                    <SelectValue placeholder="Select operation type" />
                  </SelectTrigger>
                  <SelectContent>
                    {operationTypes.map((type) => (
                      <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-[#F79B72]">Step Description</Label>
                <Input
                  value={stepDescription}
                  onChange={(e) => setStepDescription(e.target.value)}
                  placeholder="Enter step description"
                  className="bg-[#2A4759] text-[#EEEEEE] border-[#EEEEEE]/30"
                />
              </div>

              {/* Files selection - show only for certain operations */}
              {(selectedOperationType === 'file_copy' || selectedOperationType === 'sql_operations' || selectedOperationType === 'ansible_playbook') && (
                <div>
                  <Label className="text-[#F79B72]">Select Files</Label>
                  <Select value={selectedFile} onValueChange={handleFileSelect}>
                    <SelectTrigger className="bg-[#2A4759] text-[#EEEEEE] border-[#EEEEEE]/30">
                      <SelectValue placeholder={ftNumber ? "Select files to deploy" : "Select FT number first"} />
                    </SelectTrigger>
                    <SelectContent>
                      {files.map((file: string) => (
                        <SelectItem key={file} value={file}>{file}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  
                  {selectedFiles.length > 0 && (
                    <ScrollArea className="h-20 mt-2 p-2 bg-[#2A4759]/50 rounded border">
                      <div className="flex flex-wrap gap-1">
                        {selectedFiles.map((file, index) => (
                          <Badge key={index} variant="secondary" className="text-xs">
                            {file}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-4 w-4 p-0 ml-1"
                              onClick={() => removeFile(file)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </Badge>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </div>
              )}

              {/* VM selection - show for service restart */}
              {selectedOperationType === 'service_restart' && (
                <div>
                  <Label className="text-[#F79B72]">Target VMs</Label>
                  <Select value={selectedVM} onValueChange={handleVMSelect}>
                    <SelectTrigger className="bg-[#2A4759] text-[#EEEEEE] border-[#EEEEEE]/30">
                      <SelectValue placeholder="Select target VMs" />
                    </SelectTrigger>
                    <SelectContent>
                      {vms.map((vm: any) => (
                        <SelectItem key={vm.vm_name} value={vm.vm_name}>{vm.vm_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  
                  {selectedVMs.length > 0 && (
                    <ScrollArea className="h-20 mt-2 p-2 bg-[#2A4759]/50 rounded border">
                      <div className="flex flex-wrap gap-1">
                        {selectedVMs.map((vm, index) => (
                          <Badge key={index} variant="secondary" className="text-xs">
                            {vm}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-4 w-4 p-0 ml-1"
                              onClick={() => removeVM(vm)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </Badge>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </div>
              )}

              {/* Operation-specific fields */}
              {selectedOperationType === 'file_copy' && (
                <>
                  <div>
                    <Label className="text-[#F79B72]">Target User</Label>
                    <Select value={targetUser} onValueChange={setTargetUser}>
                      <SelectTrigger className="bg-[#2A4759] text-[#EEEEEE] border-[#EEEEEE]/30">
                        <SelectValue placeholder="Select target user" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="infadm">infadm</SelectItem>
                        <SelectItem value="abpwrk1">abpwrk1</SelectItem>
                        <SelectItem value="admin">admin</SelectItem>
                        <SelectItem value="root">root</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[#F79B72]">Target Path</Label>
                    <Input
                      value={targetPath}
                      onChange={(e) => setTargetPath(e.target.value)}
                      placeholder="/home/users/abpwrk1/pbin/app"
                      className="bg-[#2A4759] text-[#EEEEEE] border-[#EEEEEE]/30"
                    />
                  </div>
                </>
              )}

              {selectedOperationType === 'service_restart' && (
                <div>
                  <Label className="text-[#F79B72]">Service</Label>
                  <Select value={selectedService} onValueChange={setSelectedService}>
                    <SelectTrigger className="bg-[#2A4759] text-[#EEEEEE] border-[#EEEEEE]/30">
                      <SelectValue placeholder="Select service" />
                    </SelectTrigger>
                    <SelectContent>
                      {services.map((service: string) => (
                        <SelectItem key={service} value={service}>{service}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {selectedOperationType === 'helm_upgrade' && (
                <div>
                  <Label className="text-[#F79B72]">Helm Deployment Type</Label>
                  <Select value={helmDeploymentType} onValueChange={setHelmDeploymentType}>
                    <SelectTrigger className="bg-[#2A4759] text-[#EEEEEE] border-[#EEEEEE]/30">
                      <SelectValue placeholder="Select helm type" />
                    </SelectTrigger>
                    <SelectContent>
                      {helmTypes.map((type: string) => (
                        <SelectItem key={type} value={type}>{type}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {selectedOperationType === 'sql_operations' && (
                <>
                  <div>
                    <Label className="text-[#F79B72]">Database Connection</Label>
                    <Select value={dbConnection} onValueChange={setDbConnection}>
                      <SelectTrigger className="bg-[#2A4759] text-[#EEEEEE] border-[#EEEEEE]/30">
                        <SelectValue placeholder="Select database" />
                      </SelectTrigger>
                      <SelectContent>
                        {dbConnections.map((conn: any) => (
                          <SelectItem key={conn.db_connection} value={conn.db_connection}>
                            {conn.db_connection}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[#F79B72]">Database User</Label>
                    <Input
                      value={dbUser}
                      onChange={(e) => setDbUser(e.target.value)}
                      placeholder="Enter database user"
                      className="bg-[#2A4759] text-[#EEEEEE] border-[#EEEEEE]/30"
                    />
                  </div>
                </>
              )}

              <div>
                <Button
                  onClick={addStep}
                  disabled={!selectedOperationType || !stepDescription}
                  className="w-full bg-[#2A4759] text-[#EEEEEE] hover:bg-[#2A4759]/80 border-[#EEEEEE]/30"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Step
                </Button>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={handleGenerateTemplate}
                  disabled={steps.length === 0 || !ftNumber}
                  className="flex-1 bg-[#F79B72] text-[#2A4759] hover:bg-[#F79B72]/80"
                >
                  Generate Template
                </Button>
                
                <Button
                  onClick={handleRefreshAvailableTemplates}
                  disabled={isRefreshing}
                  variant="outline"
                  className="px-3 border-[#F79B72] text-[#F79B72] hover:bg-[#F79B72]/10 hover:text-[#F79B72]"
                >
                  {isRefreshing ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right column - Saved Templates and Generated template */}
        <div className="space-y-6">
          {/* Saved Templates */}
          <Card className="bg-[#1a2b42] text-[#EEEEEE] border-2 border-[#EEEEEE]/30">
            <CardHeader>
              <CardTitle className="text-[#F79B72]">Saved Templates</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label className="text-[#F79B72]">Load Existing Template</Label>
                <Select value={selectedTemplate} onValueChange={handleTemplateSelect}>
                  <SelectTrigger className="bg-[#2A4759] text-[#EEEEEE] border-[#EEEEEE]/30">
                    <SelectValue placeholder={isLoadingTemplates ? "Loading..." : "Select a saved template"} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableTemplates.map((template: string) => (
                      <SelectItem key={template} value={template}>{template}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Generated Template */}
          {generatedTemplate && (
            <Card className="bg-[#1a2b42] text-[#EEEEEE] border-2 border-[#EEEEEE]/30">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-[#F79B72]">Generated Template</CardTitle>
                <Button
                  onClick={handleSaveTemplate}
                  disabled={isSaving}
                  className="bg-green-600 text-white hover:bg-green-700"
                >
                  {isSaving ? 'Saving...' : 'Save Template'}
                </Button>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-96">
                  <pre className="text-xs bg-[#2A4759]/50 p-4 rounded overflow-auto whitespace-pre-wrap">
                    {JSON.stringify(generatedTemplate, null, 2)}
                  </pre>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Bottom section - Deployment Steps (full width) */}
        <div className="col-span-2">
          <Card className="bg-[#1a2b42] text-[#EEEEEE] border-2 border-[#EEEEEE]/30">
            <CardHeader>
              <CardTitle className="text-[#F79B72]">Deployment Steps</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-80">
                {steps.length === 0 ? (
                  <p className="text-[#EEEEEE]/50 text-center">No steps added yet</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {steps.map((step, index) => (
                      <div key={step.id} className="p-3 bg-[#2A4759]/50 rounded-md border border-[#EEEEEE]/20">
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-[#F79B72] font-medium">Step {index + 1}</span>
                          <Button
                            onClick={() => removeStep(step.id)}
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-red-400 hover:text-red-300"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="space-y-1 text-sm">
                          <div><span className="text-[#F79B72]">Type:</span> {step.type}</div>
                          <div><span className="text-[#F79B72]">Description:</span> {step.description}</div>
                          {step.files && step.files.length > 0 && (
                            <div><span className="text-[#F79B72]">Files:</span> {step.files.join(', ')}</div>
                          )}
                          {step.targetVMs && step.targetVMs.length > 0 && (
                            <div><span className="text-[#F79B72]">VMs:</span> {step.targetVMs.join(', ')}</div>
                          )}
                          {step.targetUser && (
                            <div><span className="text-[#F79B72]">User:</span> {step.targetUser}</div>
                          )}
                          {step.targetPath && (
                            <div><span className="text-[#F79B72]">Path:</span> {step.targetPath}</div>
                          )}
                          {step.service && (
                            <div><span className="text-[#F79B72]">Service:</span> {step.service}</div>
                          )}
                          {step.helmDeploymentType && (
                            <div><span className="text-[#F79B72]">Helm Type:</span> {step.helmDeploymentType}</div>
                          )}
                          {step.sqlQuery && (
                            <div><span className="text-[#F79B72]">SQL:</span> {step.sqlQuery}</div>
                          )}
                          {step.dbConnection && (
                            <div><span className="text-[#F79B72]">DB:</span> {step.dbConnection}</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default TemplateGenerator;