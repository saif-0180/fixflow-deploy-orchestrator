
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Plus, Download, Upload, RefreshCw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import LogDisplay from './LogDisplay';

const TemplateGenerator = () => {
  const { toast } = useToast();

  // Template state
  const [templateName, setTemplateName] = useState('');
  const [ftNumber, setFtNumber] = useState('');
  const [steps, setSteps] = useState([]);
  const [generatedTemplate, setGeneratedTemplate] = useState(null);
  const [logs, setLogs] = useState([]);
  
  // Saved templates state
  const [savedTemplates, setSavedTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);

  // Fetch available FTs
  const { data: availableFts = [], isLoading: isLoadingFts } = useQuery({
    queryKey: ['available-fts'],
    queryFn: async () => {
      const response = await fetch('/api/fts');
      if (!response.ok) throw new Error('Failed to fetch FTs');
      return response.json();
    },
    refetchOnWindowFocus: false,
  });

  // Fetch available files for selected FT
  const { data: availableFiles = [], isLoading: isLoadingFiles } = useQuery({
    queryKey: ['ft-files', ftNumber],
    queryFn: async () => {
      if (!ftNumber) return [];
      const response = await fetch(`/api/files/${ftNumber}`);
      if (!response.ok) throw new Error('Failed to fetch files');
      return response.json();
    },
    enabled: !!ftNumber,
    refetchOnWindowFocus: false,
  });

  // Fetch VMs
  const { data: vmsData = [], isLoading: isLoadingVms } = useQuery({
    queryKey: ['vms'],
    queryFn: async () => {
      const response = await fetch('/api/vms');
      if (!response.ok) throw new Error('Failed to fetch VMs');
      return response.json();
    },
    refetchOnWindowFocus: false,
  });

  // Fetch services
  const { data: servicesData = [], isLoading: isLoadingServices } = useQuery({
    queryKey: ['services'],
    queryFn: async () => {
      const response = await fetch('/api/systemd/services');
      if (!response.ok) throw new Error('Failed to fetch services');
      return response.json();
    },
    refetchOnWindowFocus: false,
  });

  // Fetch playbooks
  const { data: playbooksData = [], isLoading: isLoadingPlaybooks } = useQuery({
    queryKey: ['playbooks'],
    queryFn: async () => {
      const response = await fetch('/api/playbooks');
      if (!response.ok) throw new Error('Failed to fetch playbooks');
      return response.json();
    },
    refetchOnWindowFocus: false,
  });

  // Fetch helm upgrades
  const { data: helmData = [], isLoading: isLoadingHelm } = useQuery({
    queryKey: ['helm-upgrades'],
    queryFn: async () => {
      const response = await fetch('/api/helm-upgrades');
      if (!response.ok) throw new Error('Failed to fetch helm upgrades');
      return response.json();
    },
    refetchOnWindowFocus: false,
  });

  // Fetch DB connections
  const { data: dbData = {}, isLoading: isLoadingDb } = useQuery({
    queryKey: ['db-inventory'],
    queryFn: async () => {
      const response = await fetch('/api/db-inventory');
      if (!response.ok) throw new Error('Failed to fetch DB inventory');
      return response.json();
    },
    refetchOnWindowFocus: false,
  });

  // Load saved templates on component mount
  useEffect(() => {
    loadSavedTemplates();
  }, []);

  // Set template name when FT is selected
  useEffect(() => {
    if (ftNumber) {
      setTemplateName(`${ftNumber}_template`);
    }
  }, [ftNumber]);

  const loadSavedTemplates = async () => {
    setIsLoadingTemplates(true);
    try {
      const response = await fetch('/api/templates/list');
      if (response.ok) {
        const data = await response.json();
        setSavedTemplates(data || []);
      }
    } catch (error) {
      console.error('Error loading saved templates:', error);
    } finally {
      setIsLoadingTemplates(false);
    }
  };

  const loadTemplate = async (templateName) => {
    try {
      const response = await fetch(`/api/templates/${templateName}`);
      if (response.ok) {
        const data = await response.json();
        setGeneratedTemplate(data);
        setTemplateName(data.metadata?.ft_number ? `${data.metadata.ft_number}_template` : templateName);
        setFtNumber(data.metadata?.ft_number || '');
        setSteps(data.steps || []);
        toast({
          title: "Template Loaded",
          description: `Template "${templateName}" loaded successfully`,
        });
      }
    } catch (error) {
      console.error('Error loading template:', error);
      toast({
        title: "Error",
        description: "Failed to load template",
        variant: "destructive",
      });
    }
  };

  const addStep = () => {
    const newStep = {
      id: Date.now(),
      order: steps.length + 1,
      type: 'file_deployment',
      description: '',
      ftNumber: ftNumber,
      files: [],
      targetPath: '/home/users/abpwrk1/pbin/app',
      targetUser: 'abpwrk1',
      targetVMs: []
    };
    setSteps([...steps, newStep]);
  };

  const removeStep = (stepId) => {
    const updatedSteps = steps.filter(step => step.id !== stepId);
    const reorderedSteps = updatedSteps.map((step, index) => ({
      ...step,
      order: index + 1
    }));
    setSteps(reorderedSteps);
  };

  const updateStep = (stepId, field, value) => {
    setSteps(steps.map(step => 
      step.id === stepId ? { ...step, [field]: value } : step
    ));
  };

  const generateTemplate = () => {
    if (!templateName || !ftNumber || steps.length === 0) {
      toast({
        title: "Validation Error",
        description: "Please provide FT number and at least one step",
        variant: "destructive",
      });
      return;
    }

    const template = {
      metadata: {
        ft_number: ftNumber,
        generated_at: new Date().toISOString(),
        description: `Deployment template for ${ftNumber}`,
        selectedFiles: [...new Set(steps.flatMap(step => step.files || []))],
        selectedVMs: [...new Set(steps.flatMap(step => step.targetVMs || []))],
        targetUser: steps.find(step => step.targetUser)?.targetUser,
        service: steps.find(step => step.service)?.service
      },
      steps: steps.map(step => ({
        order: step.order,
        type: step.type,
        description: step.description,
        ...step
      })),
      dependencies: steps.map((step, index) => ({
        step: step.order,
        depends_on: index > 0 ? [steps[index - 1].order] : [],
        parallel: false
      }))
    };

    setGeneratedTemplate(template);
    setLogs([
      `Template "${templateName}" generated successfully`,
      `FT Number: ${ftNumber}`,
      `Steps: ${steps.length}`,
      'Template is ready for deployment or saving'
    ]);

    toast({
      title: "Template Generated",
      description: `Template "${templateName}" has been generated successfully`,
    });
  };

  const saveTemplate = async () => {
    if (!generatedTemplate) {
      toast({
        title: "Error",
        description: "No template to save. Please generate a template first.",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await fetch('/api/templates/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          template: generatedTemplate,
          name: templateName
        }),
      });

      if (response.ok) {
        toast({
          title: "Success",
          description: "Template saved successfully",
        });
        loadSavedTemplates();
      } else {
        throw new Error('Failed to save template');
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save template",
        variant: "destructive",
      });
    }
  };

  const renderStepConfiguration = (step) => {
    const commonFields = (
      <>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Step Order</Label>
            <Input
              type="number"
              value={step.order}
              onChange={(e) => updateStep(step.id, 'order', parseInt(e.target.value))}
              className="bg-[#2A4759] text-[#EEEEEE] border-[#EEEEEE]/30"
            />
          </div>
          <div>
            <Label>Step Type</Label>
            <Select
              value={step.type}
              onValueChange={(value) => updateStep(step.id, 'type', value)}
            >
              <SelectTrigger className="bg-[#2A4759] text-[#EEEEEE] border-[#EEEEEE]/30">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#2A4759] text-[#EEEEEE] border-[#EEEEEE]/30">
                <SelectItem value="file_deployment">File Deployment</SelectItem>
                <SelectItem value="sql_deployment">SQL Deployment</SelectItem>
                <SelectItem value="service_restart">Service Management</SelectItem>
                <SelectItem value="ansible_playbook">Ansible Playbook</SelectItem>
                <SelectItem value="helm_upgrade">Helm Upgrade</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label>Description</Label>
          <Input
            value={step.description}
            onChange={(e) => updateStep(step.id, 'description', e.target.value)}
            placeholder="Describe what this step does"
            className="bg-[#2A4759] text-[#EEEEEE] border-[#EEEEEE]/30"
          />
        </div>
      </>
    );

    switch (step.type) {
      case 'file_deployment':
        return (
          <div className="space-y-4">
            {commonFields}
            <div>
              <Label>Select FT</Label>
              <Select
                value={step.ftNumber || ftNumber}
                onValueChange={(value) => updateStep(step.id, 'ftNumber', value)}
              >
                <SelectTrigger className="bg-[#2A4759] text-[#EEEEEE] border-[#EEEEEE]/30">
                  <SelectValue placeholder={isLoadingFts ? "Loading FTs..." : "Select FT"} />
                </SelectTrigger>
                <SelectContent className="bg-[#2A4759] text-[#EEEEEE] border-[#EEEEEE]/30">
                  {availableFts.map((ft) => (
                    <SelectItem key={ft} value={ft}>{ft}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Select Files</Label>
              <Select
                value={step.files?.join(', ') || ''}
                onValueChange={(value) => updateStep(step.id, 'files', value ? [value] : [])}
              >
                <SelectTrigger className="bg-[#2A4759] text-[#EEEEEE] border-[#EEEEEE]/30">
                  <SelectValue placeholder={isLoadingFiles ? "Loading files..." : "Select files"} />
                </SelectTrigger>
                <SelectContent className="bg-[#2A4759] text-[#EEEEEE] border-[#EEEEEE]/30">
                  {availableFiles.map((file) => (
                    <SelectItem key={file} value={file}>{file}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Target User</Label>
                <Select
                  value={step.targetUser || ''}
                  onValueChange={(value) => updateStep(step.id, 'targetUser', value)}
                >
                  <SelectTrigger className="bg-[#2A4759] text-[#EEEEEE] border-[#EEEEEE]/30">
                    <SelectValue placeholder="Select target user" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#2A4759] text-[#EEEEEE] border-[#EEEEEE]/30">
                    <SelectItem value="infadm">infadm</SelectItem>
                    <SelectItem value="abpwrk1">abpwrk1</SelectItem>
                    <SelectItem value="admin">admin</SelectItem>
                    <SelectItem value="root">root</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Target Path</Label>
                <Select
                  value={step.targetPath || ''}
                  onValueChange={(value) => updateStep(step.id, 'targetPath', value)}
                >
                  <SelectTrigger className="bg-[#2A4759] text-[#EEEEEE] border-[#EEEEEE]/30">
                    <SelectValue placeholder="Select target path" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#2A4759] text-[#EEEEEE] border-[#EEEEEE]/30">
                    <SelectItem value="/home/users/abpwrk1/pbin/app">/home/users/abpwrk1/pbin/app</SelectItem>
                    <SelectItem value="/home/users/infadm/pbin/app">/home/users/infadm/pbin/app</SelectItem>
                    <SelectItem value="/home/users/admin/pbin/app">/home/users/admin/pbin/app</SelectItem>
                    <SelectItem value="/root/pbin/app">/root/pbin/app</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Target VMs</Label>
              <Select
                value={step.targetVMs?.join(', ') || ''}
                onValueChange={(value) => updateStep(step.id, 'targetVMs', value ? [value] : [])}
              >
                <SelectTrigger className="bg-[#2A4759] text-[#EEEEEE] border-[#EEEEEE]/30">
                  <SelectValue placeholder={isLoadingVms ? "Loading VMs..." : "Select VMs"} />
                </SelectTrigger>
                <SelectContent className="bg-[#2A4759] text-[#EEEEEE] border-[#EEEEEE]/30">
                  {vmsData.vms?.map((vm) => (
                    <SelectItem key={vm.name} value={vm.name}>{vm.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      case 'sql_deployment':
        return (
          <div className="space-y-4">
            {commonFields}
            <div>
              <Label>Select FT</Label>
              <Select
                value={step.ftNumber || ftNumber}
                onValueChange={(value) => updateStep(step.id, 'ftNumber', value)}
              >
                <SelectTrigger className="bg-[#2A4759] text-[#EEEEEE] border-[#EEEEEE]/30">
                  <SelectValue placeholder={isLoadingFts ? "Loading FTs..." : "Select FT"} />
                </SelectTrigger>
                <SelectContent className="bg-[#2A4759] text-[#EEEEEE] border-[#EEEEEE]/30">
                  {availableFts.map((ft) => (
                    <SelectItem key={ft} value={ft}>{ft}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Select SQL Files</Label>
              <Select
                value={step.files?.join(', ') || ''}
                onValueChange={(value) => updateStep(step.id, 'files', value ? [value] : [])}
              >
                <SelectTrigger className="bg-[#2A4759] text-[#EEEEEE] border-[#EEEEEE]/30">
                  <SelectValue placeholder={isLoadingFiles ? "Loading files..." : "Select SQL files"} />
                </SelectTrigger>
                <SelectContent className="bg-[#2A4759] text-[#EEEEEE] border-[#EEEEEE]/30">
                  {availableFiles.filter(file => file.endsWith('.sql')).map((file) => (
                    <SelectItem key={file} value={file}>{file}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Database Connection</Label>
                <Select
                  value={step.dbConnection || ''}
                  onValueChange={(value) => updateStep(step.id, 'dbConnection', value)}
                >
                  <SelectTrigger className="bg-[#2A4759] text-[#EEEEEE] border-[#EEEEEE]/30">
                    <SelectValue placeholder="Select DB Connection" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#2A4759] text-[#EEEEEE] border-[#EEEEEE]/30">
                    {dbData.db_connections?.map((conn) => (
                      <SelectItem key={conn.db_connection} value={conn.db_connection}>
                        {conn.db_connection}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Database User</Label>
                <Select
                  value={step.dbUser || ''}
                  onValueChange={(value) => updateStep(step.id, 'dbUser', value)}
                >
                  <SelectTrigger className="bg-[#2A4759] text-[#EEEEEE] border-[#EEEEEE]/30">
                    <SelectValue placeholder="Select DB User" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#2A4759] text-[#EEEEEE] border-[#EEEEEE]/30">
                    {dbData.db_users?.map((user) => (
                      <SelectItem key={user} value={user}>{user}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Database Password</Label>
              <Input
                type="password"
                value={step.dbPassword || ''}
                onChange={(e) => {
                  const password = e.target.value;
                  // Store as base64 encoded in the step
                  const encodedPassword = password ? btoa(password) : '';
                  updateStep(step.id, 'dbPassword', encodedPassword);
                }}
                placeholder="Database password"
                className="bg-[#2A4759] text-[#EEEEEE] border-[#EEEEEE]/30"
              />
            </div>
          </div>
        );

      case 'service_restart':
        return (
          <div className="space-y-4">
            {commonFields}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Service Name</Label>
                <Select
                  value={step.service || ''}
                  onValueChange={(value) => updateStep(step.id, 'service', value)}
                >
                  <SelectTrigger className="bg-[#2A4759] text-[#EEEEEE] border-[#EEEEEE]/30">
                    <SelectValue placeholder={isLoadingServices ? "Loading services..." : "Select Service"} />
                  </SelectTrigger>
                  <SelectContent className="bg-[#2A4759] text-[#EEEEEE] border-[#EEEEEE]/30">
                    {servicesData.map((service) => (
                      <SelectItem key={service} value={service}>{service}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Operation</Label>
                <Select
                  value={step.operation || 'restart'}
                  onValueChange={(value) => updateStep(step.id, 'operation', value)}
                >
                  <SelectTrigger className="bg-[#2A4759] text-[#EEEEEE] border-[#EEEEEE]/30">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#2A4759] text-[#EEEEEE] border-[#EEEEEE]/30">
                    <SelectItem value="start">Start</SelectItem>
                    <SelectItem value="stop">Stop</SelectItem>
                    <SelectItem value="restart">Restart</SelectItem>
                    <SelectItem value="status">Status</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Target VMs</Label>
              <Select
                value={step.targetVMs?.join(', ') || ''}
                onValueChange={(value) => updateStep(step.id, 'targetVMs', value ? [value] : [])}
              >
                <SelectTrigger className="bg-[#2A4759] text-[#EEEEEE] border-[#EEEEEE]/30">
                  <SelectValue placeholder={isLoadingVms ? "Loading VMs..." : "Select VMs"} />
                </SelectTrigger>
                <SelectContent className="bg-[#2A4759] text-[#EEEEEE] border-[#EEEEEE]/30">
                  {vmsData.vms?.map((vm) => (
                    <SelectItem key={vm.name} value={vm.name}>{vm.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      case 'ansible_playbook':
        return (
          <div className="space-y-4">
            {commonFields}
            <div>
              <Label>Playbook</Label>
              <Select
                value={step.playbook || ''}
                onValueChange={(value) => updateStep(step.id, 'playbook', value)}
              >
                <SelectTrigger className="bg-[#2A4759] text-[#EEEEEE] border-[#EEEEEE]/30">
                  <SelectValue placeholder={isLoadingPlaybooks ? "Loading playbooks..." : "Select Playbook"} />
                </SelectTrigger>
                <SelectContent className="bg-[#2A4759] text-[#EEEEEE] border-[#EEEEEE]/30">
                  {playbooksData.playbooks?.map((playbook) => (
                    <SelectItem key={playbook.name} value={playbook.name}>{playbook.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      case 'helm_upgrade':
        return (
          <div className="space-y-4">
            {commonFields}
            <div>
              <Label>Pod Deployment Type</Label>
              <Select
                value={step.helmDeploymentType || ''}
                onValueChange={(value) => updateStep(step.id, 'helmDeploymentType', value)}
              >
                <SelectTrigger className="bg-[#2A4759] text-[#EEEEEE] border-[#EEEEEE]/30">
                  <SelectValue placeholder={isLoadingHelm ? "Loading pods..." : "Select Pod"} />
                </SelectTrigger>
                <SelectContent className="bg-[#2A4759] text-[#EEEEEE] border-[#EEEEEE]/30">
                  {helmData.helm_upgrades?.map((helm) => (
                    <SelectItem key={helm.pod_name} value={helm.pod_name}>{helm.pod_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      default:
        return commonFields;
    }
  };

  return (
    <div className="min-h-screen bg-[#0A1929] p-6">
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left Column - 3 blocks */}
        <div className="lg:col-span-3 space-y-6">
          {/* Template Configuration */}
          <Card className="bg-[#1a2b42] text-[#EEEEEE] border-2 border-[#EEEEEE]/30">
            <CardHeader>
              <CardTitle className="text-[#F79B72]">Template Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Select FT</Label>
                <Select value={ftNumber} onValueChange={setFtNumber}>
                  <SelectTrigger className="bg-[#2A4759] text-[#EEEEEE] border-[#EEEEEE]/30">
                    <SelectValue placeholder={isLoadingFts ? "Loading FTs..." : "Select FT"} />
                  </SelectTrigger>
                  <SelectContent className="bg-[#2A4759] text-[#EEEEEE] border-[#EEEEEE]/30">
                    {availableFts.map((ft) => (
                      <SelectItem key={ft} value={ft}>{ft}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Template Name</Label>
                <Input
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="Template name will be auto-generated"
                  className="bg-[#2A4759] text-[#EEEEEE] border-[#EEEEEE]/30"
                  readOnly
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={generateTemplate}
                  className="flex-1 bg-[#F79B72] text-[#2A4759] hover:bg-[#F79B72]/80"
                >
                  Generate Template
                </Button>
                <Button
                  onClick={saveTemplate}
                  disabled={!generatedTemplate}
                  className="flex-1 bg-green-600 text-white hover:bg-green-700"
                >
                  Save Template
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Deployment Steps */}
          <Card className="bg-[#1a2b42] text-[#EEEEEE] border-2 border-[#EEEEEE]/30">
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle className="text-[#F79B72]">Deployment Steps</CardTitle>
                <Button onClick={addStep} size="sm" className="bg-[#F79B72] text-[#2A4759] hover:bg-[#F79B72]/80">
                  <Plus className="h-4 w-4 mr-1" />
                  Add Step
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 max-h-96 overflow-y-auto">
              {steps.map((step) => (
                <Card key={step.id} className="bg-[#2A4759] border-[#EEEEEE]/20">
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-center">
                      <h4 className="text-sm font-medium text-[#F79B72]">Step {step.order}</h4>
                      <Button
                        onClick={() => removeStep(step.id)}
                        size="sm"
                        variant="ghost"
                        className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {renderStepConfiguration(step)}
                  </CardContent>
                </Card>
              ))}
              {steps.length === 0 && (
                <div className="text-center text-gray-400 py-8">
                  <p>No steps configured yet.</p>
                  <p className="text-sm">Click "Add Step" to get started.</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Template Generation Logs */}
          <LogDisplay 
            logs={logs} 
            title="Template Generation Logs" 
            height="300px"
            status="idle"
          />
        </div>

        {/* Right Column - 2 blocks */}
        <div className="lg:col-span-2 space-y-6">
          {/* Saved Templates */}
          <Card className="bg-[#1a2b42] text-[#EEEEEE] border-2 border-[#EEEEEE]/30">
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle className="text-[#F79B72]">Saved Templates</CardTitle>
                <Button 
                  onClick={loadSavedTemplates} 
                  size="sm" 
                  variant="outline"
                  className="border-[#EEEEEE]/30 text-[#EEEEEE] hover:bg-[#2A4759]"
                >
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Select
                  value={selectedTemplate}
                  onValueChange={setSelectedTemplate}
                  disabled={isLoadingTemplates}
                >
                  <SelectTrigger className="bg-[#2A4759] text-[#EEEEEE] border-[#EEEEEE]/30">
                    <SelectValue placeholder={isLoadingTemplates ? "Loading..." : "Select a saved template"} />
                  </SelectTrigger>
                  <SelectContent className="bg-[#2A4759] text-[#EEEEEE] border-[#EEEEEE]/30">
                    {savedTemplates.map((template) => (
                      <SelectItem key={template} value={template}>
                        {template}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={() => selectedTemplate && loadTemplate(selectedTemplate)}
                  disabled={!selectedTemplate || isLoadingTemplates}
                  className="w-full bg-[#F79B72] text-[#2A4759] hover:bg-[#F79B72]/80"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Load Template
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Generated Template Display */}
          <Card className="bg-[#1a2b42] text-[#EEEEEE] border-2 border-[#EEEEEE]/30" style={{ height: 'calc(100vh - 400px)' }}>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle className="text-[#F79B72]">Generated Template</CardTitle>
                {generatedTemplate && (
                  <Button
                    onClick={() => {
                      const dataStr = JSON.stringify(generatedTemplate, null, 2);
                      const dataBlob = new Blob([dataStr], { type: 'application/json' });
                      const url = URL.createObjectURL(dataBlob);
                      const link = document.createElement('a');
                      link.href = url;
                      link.download = `${templateName}.json`;
                      link.click();
                    }}
                    size="sm"
                    className="bg-blue-600 text-white hover:bg-blue-700"
                  >
                    <Download className="h-4 w-4 mr-1" />
                    Export
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden">
              {generatedTemplate ? (
                <div className="bg-[#0A1929] rounded-md p-4 h-full overflow-auto">
                  <pre className="text-sm text-gray-300 whitespace-pre-wrap">
                    {JSON.stringify(generatedTemplate, null, 2)}
                  </pre>
                </div>
              ) : (
                <div className="text-center text-gray-400 h-full flex items-center justify-center">
                  <div>
                    <p>No template generated yet.</p>
                    <p className="text-sm">Configure steps and click "Generate Template" to create one.</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default TemplateGenerator;
