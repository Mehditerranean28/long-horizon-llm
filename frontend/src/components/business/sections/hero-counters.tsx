"use client";
import React from "react";
import type { AppTranslations } from "@/lib/translations";

interface Props {
  t: AppTranslations;
}

const HeroCounters = ({ t }: Props) => {
  return (
    <div className="hero-counters_layout">
      <div className="hero-counters_wrapper">
        <div className="text-size-medium">
          <div className="andl-counter-init">
            <div className="component-counter-prefix" />
          </div>
        </div>
        <div>
          <p className="text-weight-medium">
            {t.businessHeroCounterTalentPool}
          </p>
        </div>
        <div className="hero-counters_line-decoration" />
      </div>
      <div className="hero-counters_wrapper">
        <div className="text-size-medium">
          <div className="andl-counter-init">
          </div>
        </div>
        <div>
          <p className="text-weight-medium">
            {t.businessHeroCounterCostSavings}
          </p>
        </div>
        <div className="hero-counters_line-decoration" />
      </div>
      <div className="hero-counters_wrapper">
        <div className="text-size-medium">
          <div className="andl-counter-init">
            <div className="component-counter-prefix" />
          </div>
        </div>
        <div>
          <p className="text-weight-medium">
            {t.businessHeroCounterFasterHire}
          </p>
        </div>
        <div className="hero-counters_line-decoration" />
      </div>
      <div className="hero-counters_wrapper">
        <div className="text-size-medium">
          <div className="andl-counter-init">
            <div className="component-counter-prefix" />
          </div>
        </div>
        <div>
          <p className="text-weight-medium">
            {t.businessHeroCounterFasterDelivery}
          </p>
        </div>
      </div>
    </div>
  );
};

export default HeroCounters;
