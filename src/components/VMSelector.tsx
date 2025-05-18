
import React from 'react';
import { Checkbox } from "./ui/checkbox";
import { Label } from "./ui/label";

interface VMSelectorProps {
  vms: string[];
  selectedVMs: string[];
  setSelectedVMs: React.Dispatch<React.SetStateAction<string[]>>;
  selectorId?: string; // Add a unique ID for each VM selector instance
}

const VMSelector: React.FC<VMSelectorProps> = ({ 
  vms, 
  selectedVMs, 
  setSelectedVMs, 
  selectorId = "default" 
}) => {
  const handleSelectAll = () => {
    if (selectedVMs.length === vms.length) {
      setSelectedVMs([]);
    } else {
      setSelectedVMs([...vms]);
    }
  };

  const handleToggleVM = (vm: string) => {
    setSelectedVMs((prev: string[]) => {
      if (prev.includes(vm)) {
        return prev.filter(item => item !== vm);
      } else {
        return [...prev, vm];
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-2">
        <Checkbox
          id={`select-all-${selectorId}`}
          checked={selectedVMs.length === vms.length && vms.length > 0}
          onCheckedChange={handleSelectAll}
        />
        <Label htmlFor={`select-all-${selectorId}`} className="text-[#F79B72]">Select All VMs</Label>
      </div>
      
      <div className="grid grid-cols-3 gap-2">
        {vms.map((vm) => (
          <div key={`${selectorId}-${vm}`} className="flex items-center space-x-2">
            <Checkbox
              id={`${selectorId}-${vm}`}
              checked={selectedVMs.includes(vm)}
              onCheckedChange={() => handleToggleVM(vm)}
            />
            <Label htmlFor={`${selectorId}-${vm}`} className="text-[#F79B72]">{vm}</Label>
          </div>
        ))}
      </div>
    </div>
  );
};

export default VMSelector;
