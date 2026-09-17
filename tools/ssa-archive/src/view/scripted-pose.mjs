// Reused on initial draw and every owner refresh (including undo/redo).
export function scriptedPose(preview, owner) {
  return {
    position: owner?.position ?? preview.position,
    heading:
      preview.fixed_heading ??
      (owner?.rotation.heading ?? preview.heading - (preview.heading_offset ?? 0)) + (preview.heading_offset ?? 0),
    scale: preview.scale_mode === 'template' ? preview.scale : (owner?.scale ?? preview.scale),
  };
}
