/**
 * lib/invest/deal/index.ts — ② Deal & Offering : barrel.
 *
 * Catalogue de deals (DB-backed, Epic 1.2) : mapping DB→moteur, services
 * (listDeals, getDealBySlug avec gate KYC, createDealWithSpv, updateDeal,
 * publishDeal, attachDealDocument) + KIIS versionné (createKiisDraft,
 * publishKiisVersion). La logique financière reste PURE dans `lib/invest/finance`.
 *
 * Ne crée PAS de souscription et ne fait AUCUN matching automatique
 * d'investisseurs (I3 : pas de moteur d'allocation). 1 SPV = 1 deal.
 */

export * from "./types";
export * from "./mapping";
export * from "./service";
export * from "./kiis";
