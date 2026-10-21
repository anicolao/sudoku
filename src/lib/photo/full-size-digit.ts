/** Candidate clusters can be tall but occupy a corner; isolated candidates can
 * be central but are substantially smaller than the board's full-size font.
 * Both scale and position must support treating ink as a full-size entry.
 */
export function isFullSizeDigit(image: {componentHeight:number; centerX:number; centerY:number}, referenceHeight?:number): boolean {
  return image.componentHeight>=30 &&
    (referenceHeight === undefined || image.componentHeight>=referenceHeight*0.8) &&
    image.centerX>=0.3 && image.centerX<=0.7 && image.centerY>=0.25 && image.centerY<=0.75;
}
