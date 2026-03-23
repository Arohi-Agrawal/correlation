import { CorrelationResultItem } from "@/lib/types";

function csvEscape(value: string): string {
	if (/[",\n]/.test(value)) {
		return `"${value.replace(/"/g, '""')}"`;
	}
	return value;
}

export function correlationResultsToCsv(results: CorrelationResultItem[]): string {
	const headers = [
		"sourceColumnId",
		"sourceColumnName",
		"sourceObservedType",
		"mappingCategory",
		"finalMappingDecision",
		"targetColumnId",
		"targetColumnName",
		"targetObservedType",
		"confidence",
		"status",
		"reason"
	];

	const rows = results.map((result) => {
		const reason = (result.bestMatch?.reason ?? result.finalReason).join(" | ");
		return [
			result.sourceColumnId,
			result.sourceColumnName,
			result.sourceObservedType,
			result.mappingCategory,
			result.finalMappingDecision,
			result.bestMatch?.targetColumnId ?? "",
			result.bestMatch?.targetColumnName ?? "",
			result.bestMatch?.targetType ?? "unknown",
			String(result.bestMatch?.confidence ?? 0),
			result.bestMatch?.status ?? "unmatched",
			reason
		].map((value) => csvEscape(String(value)));
	});

	return [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
}
