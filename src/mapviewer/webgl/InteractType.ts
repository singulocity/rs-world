export enum InteractType {
    NONE = 0,
    LOC = 1, // object
    OBJ = 2, // item
    NPC = 3,
    // Live world feed entities; ids are player slots, npc nids, or stable object ids.
    LIVE_PLAYER = 4,
    LIVE_NPC = 5,
    LIVE_ITEM = 6,
}
