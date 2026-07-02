import type { ComponentType, SVGProps } from "react";
import {
  BanknotesIcon,
  BuildingOffice2Icon,
  CalendarIcon,
  ChartBarIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClipboardDocumentCheckIcon,
  HomeIcon,
  MagnifyingGlassIcon,
  MapPinIcon,
  PlusIcon,
  ShareIcon,
  UserCircleIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";

export type IconName =
  | "estimate"
  | "search"
  | "network"
  | "crm"
  | "properties"
  | "leads"
  | "visits"
  | "mandates"
  | "agenda"
  | "home"
  | "user"
  | "plus"
  | "chevron-down"
  | "chevron-right";

const ICONS: Record<IconName, ComponentType<SVGProps<SVGSVGElement>>> = {
  estimate: BanknotesIcon,
  search: MagnifyingGlassIcon,
  network: ShareIcon,
  crm: UserGroupIcon,
  properties: BuildingOffice2Icon,
  leads: UserGroupIcon,
  visits: MapPinIcon,
  mandates: ClipboardDocumentCheckIcon,
  agenda: CalendarIcon,
  home: HomeIcon,
  user: UserCircleIcon,
  plus: PlusIcon,
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
