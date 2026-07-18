import type { ComponentType, SVGProps } from "react";
import {
  BanknotesIcon,
  BuildingOffice2Icon,
  CalendarIcon,
  ChartBarIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClipboardDocumentCheckIcon,
  CpuChipIcon,
  HomeIcon,
  MagnifyingGlassIcon,
  MapPinIcon,
  PlusIcon,
  QuestionMarkCircleIcon,
  ShareIcon,
  UserCircleIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";

export type IconName =
  | "estimate"
  | "search"
  | "network"
  | "properties"
  | "leads"
  | "visits"
  | "mandates"
  | "agenda"
  | "home"
  | "user"
  | "plus"
  | "agents"
  | "help"
  | "chevron-down"
  | "chevron-right";

const ICONS: Record<IconName, ComponentType<SVGProps<SVGSVGElement>>> = {
  estimate: BanknotesIcon,
  search: MagnifyingGlassIcon,
  network: ShareIcon,
  properties: BuildingOffice2Icon,
  leads: UserGroupIcon,
  visits: MapPinIcon,
  mandates: ClipboardDocumentCheckIcon,
  agenda: CalendarIcon,
  home: HomeIcon,
  user: UserCircleIcon,
  plus: PlusIcon,
  agents: CpuChipIcon,
  help: QuestionMarkCircleIcon,
  "chevron-down": ChevronDownIcon,
  "chevron-right": ChevronRightIcon,
};

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
}

export function Icon({ name, className, ...props }: IconProps) {
  const Cmp = ICONS[name] ?? ChartBarIcon;
  return <Cmp className={className ?? "size-5"} aria-hidden="true" {...props} />;
}
