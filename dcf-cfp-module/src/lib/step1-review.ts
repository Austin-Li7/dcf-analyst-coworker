import type {
  Step1AnalysisOffering,
  Step1AnalysisSegment,
  Step1Claim,
  Step1EvidenceLevel,
  Step1RecommendedAction,
  Step1ReviewState,
  Step1SourceTier,
  Step1ValidationStatus,
  Step1ValidationType,
  Step1StructuredResult,
} from "../types/cfp.ts";

interface Step1ApprovalEdits {
  segments: Array<{ id: string; canonicalName: string }>;
  offerings: Array<{ id: string; canonicalName: string; targetSegment: string }>;
}

function dedupe(items: string[]): string[] {
  return Array.from(new Set(items.filter(Boolean)));
}

function countReportedNodes(nodes: Step1StructuredResult["reported_view"]["nodes"]): number {
  return nodes.reduce((total, node) => total + 1 + countReportedNodes(node.children), 0);
}

function flattenReportedNodes(
  nodes: Step1StructuredResult["reported_view"]["nodes"],
  depth = 0,
): Step1ReviewState["reportedView"]["nodes"] {
  return nodes.flatMap((node) => [
    {
      id: node.id,
      label: node.label,
      rawNameVariants: node.raw_name_variants,
      products: node.products,
      customerType: node.customer_type ?? null,
      claimId: node.claim_id,
      evidenceLevel: node.evidence_level,
      depth,
      childCount: node.children.length,
    },
    ...flattenReportedNodes(node.children, depth + 1),
  ]);
}

function buildCanonicalNameRegistry(
  segments: Step1AnalysisSegment[],
  offeringOverrides = new Map<string, string>(),
  segmentOverrides = new Map<string, string>(),
): Record<string, string> {
  const registry: Record<string, string> = {};

  for (const segment of segments) {
    const segmentName = segmentOverrides.get(segment.id) ?? segment.canonical_name;
    for (const rawName of [segment.canonical_name, ...segment.raw_name_variants]) {
      registry[rawName] = segmentName;
    }

    for (const offering of segment.offerings) {
      const offeringName = offeringOverrides.get(offering.id) ?? offering.canonical_name;
      for (const rawName of [offering.canonical_name, ...offering.raw_name_variants]) {
        registry[rawName] = offeringName;
      }
    }
  }

  return registry;
}

function claimById(result: Step1StructuredResult): Map<string, Step1Claim> {
  return new Map(result.claims.map((claim) => [claim.claim_id, claim]));
}

function sourceReferenceForClaim(claim: Step1Claim | undefined): string {
  return claim?.source_location?.trim() || "Not available";
}

function validationTypeForItem(itemKind: "segment" | "offering"): Step1ValidationType {
  return itemKind === "segment" ? "Data" : "Information";
}

function sourceTierForEvidence(
  evidenceLevel: Step1EvidenceLevel,
  claim: Step1Claim | undefined,
): Step1SourceTier {
  if (!claim?.source_location) return "Not Found";
  if (evidenceLevel === "DISCLOSED") return "Tier 1";
  if (evidenceLevel === "STRONG_INFERENCE") return "Tier 1";
  return "Not Found";
}

function validationStatusForEvidence(
  evidenceLevel: Step1EvidenceLevel,
): Step1ValidationStatus {
  if (evidenceLevel === "DISCLOSED") return "Verified Official";
  if (evidenceLevel === "STRONG_INFERENCE") return "Partially Supported";
  if (evidenceLevel === "WEAK_INFERENCE") return "Unverified";
  return "Unverified";
}

function recommendedActionForEvidence(
  evidenceLevel: Step1EvidenceLevel,
): Step1RecommendedAction {
  if (evidenceLevel === "DISCLOSED") return "Keep";
  if (evidenceLevel === "STRONG_INFERENCE") return "Revise";
  if (evidenceLevel === "WEAK_INFERENCE") return "Remove";
  return "Remove";
}

function buildValidationMatrix(
  result: Step1StructuredResult,
): Step1ReviewState["validationMatrix"] {
  const claims = claimById(result);

  return result.analysis_view.segments.flatMap((segment) => {
    const segmentClaim = claims.get(segment.claim_id);
    const rows: Step1ReviewState["validationMatrix"] = [
      {
        id: segment.id,
        segment: segment.canonical_name,
        item: segment.canonical_name,
        validationType: validationTypeForItem("segment"),
        sourceTier: sourceTierForEvidence(segment.evidence_level, segmentClaim),
        sourceFound: Boolean(segmentClaim?.source_location),
        sourceReference: sourceReferenceForClaim(segmentClaim),
        officialSource: segment.evidence_level === "DISCLOSED" && Boolean(segmentClaim?.source_location),
        validationStatus: validationStatusForEvidence(segment.evidence_level),
        recommendedAction: recommendedActionForEvidence(segment.evidence_level),
        claimId: segment.claim_id,
        evidenceLevel: segment.evidence_level,
      },
    ];

    for (const offering of segment.offerings) {
      const offeringClaim = claims.get(offering.claim_id);
      rows.push({
        id: offering.id,
        segment: segment.canonical_name,
        item: offering.canonical_name,
        validationType: validationTypeForItem("offering"),
        sourceTier: sourceTierForEvidence(offering.evidence_level, offeringClaim),
        sourceFound: Boolean(offeringClaim?.source_location),
        sourceReference: sourceReferenceForClaim(offeringClaim),
        officialSource:
          offering.evidence_level === "DISCLOSED" && Boolean(offeringClaim?.source_location),
        validationStatus: validationStatusForEvidence(offering.evidence_level),
        recommendedAction: recommendedActionForEvidence(offering.evidence_level),
        claimId: offering.claim_id,
        evidenceLevel: offering.evidence_level,
      });
    }

    return rows;
  });
}

function buildOmissionReview(
  result: Step1StructuredResult,
): Step1ReviewState["omissionReview"] {
  const claims = claimById(result);

  return result.analysis_view.excluded_items.map((item) => {
    const claim = claims.get(item.claim_id);
    return {
      item: item.raw_name,
      reason: item.reason,
      officialSourceReference: sourceReferenceForClaim(claim),
      recommendedAction: "Review before adding downstream",
      claimId: item.claim_id,
      evidenceLevel: item.evidence_level,
    };
  });
}

export function buildStep1ReviewState(result: Step1StructuredResult): Step1ReviewState {
  const reportedNodes = flattenReportedNodes(result.reported_view.nodes);
  const analysisSegments = result.analysis_view.segments.map((segment) => ({
    id: segment.id,
    originalName: segment.canonical_name,
    suggestedName: segment.canonical_name,
    offeringCount: segment.offerings.length,
    rawNameVariants: segment.raw_name_variants,
    mappedReportedNodeIds: segment.mapped_from_reported_node_ids,
    claimId: segment.claim_id,
    evidenceLevel: segment.evidence_level,
    offerings: segment.offerings.map((offering) => ({
      id: offering.id,
      originalName: offering.canonical_name,
      suggestedName: offering.canonical_name,
      category: offering.category,
      parentSegment: segment.canonical_name,
      targetSegment: segment.canonical_name,
      productCount: offering.products.length,
      products: offering.products,
      rawNameVariants: offering.raw_name_variants,
      mappedReportedNodeIds: offering.mapped_from_reported_node_ids,
      claimId: offering.claim_id,
      evidenceLevel: offering.evidence_level,
    })),
  }));

  const offeringCount = analysisSegments.reduce(
    (total, segment) => total + segment.offerings.length,
    0,
  );
  const weakClaimCount = result.claims.filter(
    (claim) =>
      claim.evidence_level === "WEAK_INFERENCE" ||
      claim.evidence_level === "UNSUPPORTED",
  ).length;
  const warnings: string[] = [];

  if (result.sources.length === 0) {
    warnings.push("No source references were provided in the structured Step 1 result.");
  }

  if (analysisSegments.length === 0) {
    warnings.push("No analysis segments were emitted. Review the Step 1 prompt and evidence trace.");
  }

  if (result.analysis_view.excluded_items.length > 0) {
    warnings.push(
      `${result.analysis_view.excluded_items.length} item(s) were excluded instead of being force-mapped.`,
    );
  }

  if (weakClaimCount > 0) {
    warnings.push(
      `${weakClaimCount} claim(s) are weak or unsupported and should not be treated as anchor mappings.`,
    );
  }

  analysisSegments.forEach((segment) => {
    if (segment.offeringCount === 0) {
      warnings.push(`Analysis segment "${segment.originalName}" has no offerings mapped.`);
    }
  });

  analysisSegments
    .flatMap((segment) => segment.offerings)
    .forEach((offering) => {
      if (offering.productCount === 0) {
        warnings.push(`Offering "${offering.originalName}" has no products listed.`);
      }
    });

  const canonicalNameRegistry = buildCanonicalNameRegistry(result.analysis_view.segments);
  const validationMatrix = buildValidationMatrix(result);
  const omissionReview = buildOmissionReview(result);

  return {
    workflowStatus: "needs_review",
    approved: false,
    approvedAt: null,
    canonicalNameRegistry,
    summary: {
      oneLine: `${result.company_name}: ${analysisSegments.length} analysis segment(s), ${offeringCount} offering(s), ${countReportedNodes(result.reported_view.nodes)} reported node(s), ${result.claims.length} claim(s).`,
      highlights: [
        `Reported view type: ${result.reported_view.view_type}.`,
        `${analysisSegments.length} canonical analysis segment(s) are ready for review.`,
        `${offeringCount} offering mapping(s) are available for downstream projection.`,
        `${result.sources.length} source reference(s) and ${result.claims.length} traced claim(s) were validated.`,
      ],
      warnings: dedupe(warnings),
    },
    validationMatrix,
    omissionReview,
    reportedView: {
      viewType: result.reported_view.view_type,
      nodes: reportedNodes,
    },
    analysisView: {
      segments: analysisSegments,
      excludedItems: result.analysis_view.excluded_items,
    },
  };
}

export function applyStep1ApprovalEdits(
  result: Step1StructuredResult,
  edits: Step1ApprovalEdits,
): Step1StructuredResult {
  const segmentNameById = new Map(
    edits.segments.map((segment) => [segment.id, segment.canonicalName.trim()]),
  );
  const offeringNameById = new Map(
    edits.offerings.map((offering) => [offering.id, offering.canonicalName.trim()]),
  );
  const offeringTargetById = new Map(
    edits.offerings.map((offering) => [offering.id, offering.targetSegment.trim()]),
  );

  const bucketBySegmentName = new Map<string, Step1AnalysisSegment>();
  const segmentOrder: string[] = [];

  const ensureBucket = (
    targetName: string,
    fallbackSegment: Step1AnalysisSegment,
  ): Step1AnalysisSegment => {
    const existing = bucketBySegmentName.get(targetName);
    if (existing) {
      return existing;
    }

    const bucket: Step1AnalysisSegment = {
      ...fallbackSegment,
      canonical_name: targetName,
      raw_name_variants: dedupe([
        targetName,
        fallbackSegment.canonical_name,
        ...fallbackSegment.raw_name_variants,
      ]),
      mapped_from_reported_node_ids: [...fallbackSegment.mapped_from_reported_node_ids],
      offerings: [],
    };

    bucketBySegmentName.set(targetName, bucket);
    segmentOrder.push(targetName);
    return bucket;
  };

  for (const segment of result.analysis_view.segments) {
    const approvedSegmentName = segmentNameById.get(segment.id) || segment.canonical_name;
    const homeBucket = ensureBucket(approvedSegmentName, segment);

    for (const offering of segment.offerings) {
      const approvedOfferingName =
        offeringNameById.get(offering.id) || offering.canonical_name;
      const targetSegmentName =
        offeringTargetById.get(offering.id) || approvedSegmentName;
      const targetBucket = ensureBucket(targetSegmentName, segment);

      if (targetBucket !== homeBucket) {
        targetBucket.mapped_from_reported_node_ids = dedupe([
          ...targetBucket.mapped_from_reported_node_ids,
          ...segment.mapped_from_reported_node_ids,
          ...offering.mapped_from_reported_node_ids,
        ]);
      }

      const nextOffering: Step1AnalysisOffering = {
        ...offering,
        canonical_name: approvedOfferingName,
        raw_name_variants: dedupe([
          approvedOfferingName,
          offering.canonical_name,
          ...offering.raw_name_variants,
        ]),
      };

      targetBucket.offerings.push(nextOffering);
    }
  }

  const approvedSegments = segmentOrder
    .map((segmentName) => bucketBySegmentName.get(segmentName))
    .filter((segment): segment is Step1AnalysisSegment => Boolean(segment))
    .map((segment) => ({
      ...segment,
      offerings: segment.offerings,
    }));

  return {
    ...result,
    analysis_view: {
      ...result.analysis_view,
      segments: approvedSegments,
      canonical_name_registry: buildCanonicalNameRegistry(
        approvedSegments,
        offeringNameById,
        segmentNameById,
      ),
    },
  };
}
