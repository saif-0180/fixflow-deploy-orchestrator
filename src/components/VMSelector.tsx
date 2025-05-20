
import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export interface VMSelectorProps {
  onSelectionChange: (vms: string[]) => void;
  selectedTypes?: string[];
}

const VMSelector: React.FC<VMSelectorProps> = ({ onSelectionChange, selectedTypes = [] }) => {
  const [selectedVMs, setSelectedVMs] = useState<string[]>([]);
  const [vmsByType, setVmsByType] = useState<Record<string, string[]>>({});

  // Fetch VMs from inventory
  const { data: vms = [], isLoading } = useQuery({
    queryKey: ['vms'],
    queryFn: async () => {
      try {
        const response = await fetch('/api/vms');
        if (!response.ok) {
          console.error('Error fetching VMs:', await response.text());
          throw new Error('Failed to fetch VMs');
        }
        return response.json();
      } catch (error) {
        console.error('Error fetching VMs:', error);
        throw error;
      }
    },
    refetchOnWindowFocus: false,
  });

  // Group VMs by type when data loads
  useEffect(() => {
    const groupedVMs: Record<string, string[]> = {};
    
    vms.forEach((vm: any) => {
      if (!groupedVMs[vm.type]) {
        groupedVMs[vm.type] = [];
      }
      groupedVMs[vm.type].push(vm.name);
    });
    
    setVmsByType(groupedVMs);
  }, [vms]);

  // Handle checkbox changes
  const handleVMChange = (vmName: string, checked: boolean) => {
    const updatedSelection = checked
      ? [...selectedVMs, vmName]
      : selectedVMs.filter(vm => vm !== vmName);
    
    setSelectedVMs(updatedSelection);
    onSelectionChange(updatedSelection);
  };

  // Handle type selection
  const handleTypeSelection = (type: string, checked: boolean) => {
    let updatedSelection = [...selectedVMs];
    
    if (checked) {
      // Add all VMs of this type that aren't already selected
      const vmsToAdd = vmsByType[type]?.filter(vm => !selectedVMs.includes(vm)) || [];
      updatedSelection = [...updatedSelection, ...vmsToAdd];
    } else {
      // Remove all VMs of this type
      updatedSelection = updatedSelection.filter(vm => !vmsByType[type]?.includes(vm));
    }
    
    setSelectedVMs(updatedSelection);
    onSelectionChange(updatedSelection);
  };

  // Check if all VMs of a type are selected
  const isTypeSelected = (type: string) => {
    return vmsByType[type]?.every(vm => selectedVMs.includes(vm)) || false;
  };

  if (isLoading) {
    return <div>Loading VM list...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3">
        {Object.keys(vmsByType).length === 0 ? (
          <p className="text-sm text-gray-400">No VMs available in inventory.</p>
        ) : (
          Object.entries(vmsByType).map(([type, typeVMs]) => (
            <div key={type} className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id={`type-${type}`}
                  checked={isTypeSelected(type)}
                  onCheckedChange={(checked) => handleTypeSelection(type, checked === true)}
                />
                <Label htmlFor={`type-${type}`} className="font-medium">{type.toUpperCase()}</Label>
              </div>
              
              <div className="ml-6 space-y-1">
                {typeVMs.map((vm) => (
                  <div key={vm} className="flex items-center space-x-2">
                    <Checkbox 
                      id={`vm-${vm}`}
                      checked={selectedVMs.includes(vm)}
                      onCheckedChange={(checked) => handleVMChange(vm, checked === true)}
                    />
                    <Label htmlFor={`vm-${vm}`}>{vm}</Label>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default VMSelector;
