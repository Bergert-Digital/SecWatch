import { parse as parseYaml } from "yaml";
import { z } from "zod";
import type { InventoryItem } from "./types.js";

const ServiceSchema = z.object({
  name: z.string().min(1),
  github: z.string().optional(),
  docker_image: z.string().optional(),
  current_version: z.string().min(1),
});

export type ServiceEntry = z.infer<typeof ServiceSchema>;

export function loadServices(yaml: string): InventoryItem[] {
  const raw = parseYaml(yaml);
  const arr = z.array(ServiceSchema).parse(raw);
  return arr.map((s) => ({
    ecosystem: "service" as const,
    name: s.name,
    version: s.current_version,
    sourceRepo: "services.yaml",
    sourceFile: "services.yaml",
  }));
}

export function loadServiceEntries(yaml: string): ServiceEntry[] {
  return z.array(ServiceSchema).parse(parseYaml(yaml));
}
