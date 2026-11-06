import { z } from 'zod'
import { WORKSPACE_PRIORITIES } from './workspace-priority'

/** A priority update on the wire: a level sets it, null clears it, absent leaves it alone. */
export const WorkspacePriorityUpdateSchema = z.enum(WORKSPACE_PRIORITIES).nullable().optional()
