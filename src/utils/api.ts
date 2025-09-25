
export function checkIsResponsesApi(apiEndpoint: string): boolean {
  return apiEndpoint.endsWith('/responses')
}
