"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronsUpDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface NamespaceSelectProps {
  disabled?: boolean;
  value: string;
  onChange: (value: string) => void;
  namespaces: string[];
  isLoading?: boolean;
  placeholder?: string;
  allLabel?: string;
}

export function NamespaceSelect({
  disabled,
  value,
  onChange,
  namespaces,
  isLoading = false,
  placeholder,
  allLabel,
}: NamespaceSelectProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const placeholderText = placeholder ?? t("header.allNamespaces");
  const allText = allLabel ?? t("header.allNamespaces");

  const selectedLabel = useMemo(() => {
    if (!value) return placeholderText;
    return value;
  }, [value, placeholderText]);

  const handleSelect = (selectedValue: string) => {
    onChange(selectedValue);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-44 justify-between"
          disabled={disabled}
        >
          <span className="truncate">{selectedLabel}</span>
          {isLoading ? (
            <Loader2 className="ml-2 size-4 shrink-0 animate-spin opacity-50" />
          ) : (
            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-44 p-0" align="start">
        <Command>
          <CommandInput
            placeholder={placeholderText}
            className="h-9 border-0 focus-within:ring-0 focus-within:ring-offset-0"
          />
          <CommandList>
            <CommandEmpty>
              {isLoading ? t("header.loadingNamespaces") : "No namespace found."}
            </CommandEmpty>
            <CommandGroup>
              <CommandItem value="" className="cursor-pointer" onSelect={() => handleSelect("")}>
                <span className="truncate">{allText}</span>
              </CommandItem>
              {namespaces.map((namespace) => (
                <CommandItem
                  key={namespace}
                  value={namespace}
                  className="cursor-pointer"
                  onSelect={() => handleSelect(namespace)}
                >
                  <span className="truncate">{namespace}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
