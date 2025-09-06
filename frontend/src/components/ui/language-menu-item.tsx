"use client";

import React from 'react';
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import ReactCountryFlag from "react-country-flag";

interface Props {
  languageCode: string;
  label: string;
  countryCode?: string;
  /** Fallback icon when no countryCode is available */
  icon?: string;
  onSelect: () => void;
}

export function LanguageMenuItem({ languageCode, label, countryCode, icon, onSelect }: Props) {
  return (
    <DropdownMenuItem onSelect={onSelect}>
      {countryCode ? (
        <ReactCountryFlag
          svg
          countryCode={countryCode}
          style={{ width: '1em', height: '1em' }}
          className="mr-2"
        />
      ) : icon ? (
        <span className="mr-2" style={{ width: '1em', height: '1em', display: 'inline-block' }}>
          {icon}
        </span>
      ) : null}
      {label}
    </DropdownMenuItem>
  );
}

export default LanguageMenuItem;
