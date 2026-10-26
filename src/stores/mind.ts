/** Whether Divina's mind (the constellation of what she knows) is open. */
import { create } from 'zustand';

export const useMind = create<{ open: boolean }>(() => ({ open: false }));
export const openMind = () => useMind.setState({ open: true });
export const closeMind = () => useMind.setState({ open: false });
