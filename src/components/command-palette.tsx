import { useEffect } from "react";
import { useNavigate } from "react-router";
import { Moon, Search, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useUiStore } from "@/lib/stores/ui-store";
import { RESOURCE_GROUPS } from "@/features/resources/resource-types";

export function CommandPalette() {
  const open = useUiStore((s) => s.commandPaletteOpen);
  const setOpen = useUiStore((s) => s.setCommandPaletteOpen);
  const { setTheme, theme } = useTheme();
  const navigate = useNavigate();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(!useUiStore.getState().commandPaletteOpen);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [setOpen]);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search resources..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="General">
          <CommandItem
            onSelect={() => {
              setOpen(false);
              navigate("/");
            }}
          >
            <Search className="mr-2 size-4" />
            <span>Home</span>
          </CommandItem>
          <CommandItem
            onSelect={() => {
              setTheme(theme === "dark" ? "light" : "dark");
            }}
          >
            {theme === "dark" ? <Sun className="mr-2 size-4" /> : <Moon className="mr-2 size-4" />}
            <span>Toggle theme</span>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        {RESOURCE_GROUPS.map((group) => (
          <CommandGroup key={group.label} heading={group.label}>
            {group.resources.map((resource) => (
              <CommandItem
                key={resource.kind}
                value={`${group.label} ${resource.label} ${resource.kind}`}
                onSelect={() => {
                  setOpen(false);
                  navigate(`/resources/${resource.kind}`);
                }}
              >
                <resource.icon className="mr-2 size-4" />
                <span>{resource.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
