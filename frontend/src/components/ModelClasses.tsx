interface Props { classes?: string[]; task?: string | null }

export function ModelClasses({ classes, task }: Props) {
  return <div className="model-classes">
    <p><strong>Model output classes{classes?.length ? ` (${classes.length})` : ''}:</strong> {classes?.length ? classes.join(', ') : 'Classes not verified.'}</p>
    {task && <p className="control-help">Task / class namespace: <span>{task}</span>. Class order follows the model output, not dataset category IDs.</p>}
  </div>
}
