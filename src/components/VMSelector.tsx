
import React from 'react';
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

interface VMSelectorProps {
  vms: string[];
  selectedVMs: string[];
  setSelectedVMs: React.Dispatch<React.SetStateAction<string[]>>;
  selectorId: string; // Added unique ID for each selector
}

const VMSelector: React.FC<VMSelectorProps> = ({ vms, selectedVMs, setSelectedVMs, selectorId }) => {
  const handleSelectAll = () => {
    if (selectedVMs.length === vms.length) {
      setSelectedVMs([]);
    } else {
      setSelectedVMs([...vms]);
    }
  };

  const handleVMSelection = (vm: string) => {
    if (selectedVMs.includes(vm)) {
      setSelectedVMs(selectedVMs.filter(v => v !== vm));
    } else {
      setSelectedVMs([...selectedVMs, vm]);
    }
  };

  const allSelected = vms.length > 0 && selectedVMs.length === vms.length;

  return (
    <div>
      <Label htmlFor={`vm-select-${selectorId}`} className="text-[#F79B72] block mb-2">Select VMs</Label>
      
      <div className="bg-[#DDDDDD] border border-[#2A4759] rounded-md p-2">
        <div className="flex items-center space-x-2 mb-2 pb-2 border-b border-[#2A4759]">
          <Checkbox 
            id={`select-all-${selectorId}`}
            checked={allSelected} 
            onCheckedChange={handleSelectAll}
          />
          <Label htmlFor={`select-all-${selectorId}`} className="text-[#2A4759] cursor-pointer">
            Select All VMs
          </Label>
        </div>
        
        <div className="grid grid-cols-2 gap-2">
          {vms.map((vm) => (
            <div key={`${vm}-${selectorId}`} className="flex items-center space-x-2">
              <Checkbox 
                id={`${vm}-${selectorId}`}
                checked={selectedVMs.includes(vm)} 
                onCheckedChange={() => handleVMSelection(vm)}
              />
              <Label htmlFor={`${vm}-${selectorId}`} className="text-[#2A4759] cursor-pointer">
                {vm}
              </Label>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default VMSelector;
