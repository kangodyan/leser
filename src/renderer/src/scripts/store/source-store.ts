import * as db from "../db"
import intl from "react-intl-universal"
import { create } from 'zustand'
import { RSSSource, SourceState, starredCount, unreadCount } from '../models/source'
import { fetchFavicon } from "../utils";
import { appActions, useAppStore } from "./app-store";
import { MARK_READ, MARK_UNREAD, RSSItem, insertItems } from "../models/item";
import { devtools } from "zustand/middleware";
import { groupActions, useGroupStore } from "./group-store";
import { feedActions } from "./feed-store";
import { pageActions } from "./page-store";

type SourceStore = {
    sources: SourceState;
    actions: {
        initSourcesRequest: () => void;
        initSourcesSuccess: (sources: SourceState) => void;
        initSources: () => Promise<void>;
        fetchItemsSuccess: (items: RSSItem[]) => void;
        insertSource: (source: RSSSource) => Promise<RSSSource>;
        addSourceSuccess: (source: RSSSource, batch: boolean) => void;
        updateSourceDone: (source: RSSSource) => void;
        updateSource: (source: RSSSource) => Promise<void>;
        updateFavicon: (sids?: number[], force?: boolean) => Promise<void>;
        deleteSourceDone: (source: RSSSource) => void;
        deleteSource: (source: RSSSource, batch?: boolean) => Promise<void>;
        deleteSources: (sources: RSSSource[]) => Promise<void>;
        updateUnreadCounts: () => Promise<void>;
        updateStarredCounts: () => Promise<void>;
        addSourceRequest: () => void;
        addSourceFailure: (err: Error, batch: boolean) => void;
        addSource: (url: string, name?: string, batch?: boolean) => Promise<number>;
        markReadDone: (item: RSSItem, type?: string) => void;
        markUnreadDone: (item: RSSItem) => void;
        toggleStarredDone: (item: RSSItem) => void;
        toggleSourceHidden: (source: RSSSource) => void;
        markAllReadDone: (sids: number[], time: number) => void;
    }
}


let insertPromises = Promise.resolve();
export const useSourceStore = create<SourceStore>()(devtools((set, get) => ({
    sources: {},
    actions: {
        initSourcesRequest: () => {
            console.log('~~initSourcesRequest~~');
        },
        initSourcesSuccess: (sources: SourceState) => {
            set({ sources: sources });
            // [appReducer]
            appActions.initSourcesSuccess();
            // [feedReducer]
            feedActions.initSourcesSuccess(sources);
        },
        initSources: async () => {
            get().actions.initSourcesRequest();
            // 查询数据库中的数据源，并初始化时把 [unreadCount, starredCount] 都置空，再重新计算
            await db.init();
            const sources = ( await db.sourcesDB.select().from(db.sources).exec() ) as RSSSource[];
            const state: SourceState = {};
            for (let source of sources) {
                source.unreadCount = 0;
                source.starredCount = 0;
                state[source.sid] = source;
            }
            await unreadCount(state);
            await starredCount(state);
            // 订阅源分组
            groupActions.fixBrokenGroups(state);
            get().actions.initSourcesSuccess(state);
        },
        fetchItemsSuccess: (items: RSSItem[]) => {
            set(state => {
                let updateMap = new Map<number, number>();
                for (let item of items) {
                    if (!item.hasRead) {
                        updateMap.set(
                            item.source,
                            updateMap.has(item.source) ? updateMap.get(item.source) + 1 : 1,
                        )
                    }
                }
                let nextState = {} as SourceState;
                for (let [s, source] of Object.entries(state.sources)) {
                    let sid = parseInt(s);
                    if (updateMap.has(sid)) {
                        nextState[sid] = {
                            ...source,
                            unreadCount: source.unreadCount + updateMap.get(sid),
                            starredCount: source.starredCount + updateMap.get(sid),
                        } as RSSSource;
                    } else {
                        nextState[sid] = source;
                    }
                }
                return { sources: nextState };
            });
        },
        insertSource: (source: RSSSource) => {
            return new Promise((resolve, reject) => {
                console.log('~~insertSource~~');
                insertPromises = insertPromises.then(async () => {
                    let sids = Object.values(useSourceStore.getState().sources).map(s => s.sid);
                    source.sid = Math.max(...sids, -1) + 1;
                    const row = db.sources.createRow(source);
                    try {
                        const inserted = (await db.sourcesDB
                            .insert()
                            .into(db.sources)
                            .values([row])
                            .exec()) as RSSSource[]
                        resolve(inserted[0]);
                    } catch (err) {
                        if (err.code === 201) {
                            reject(intl.get("sources.exist"));
                        } else {
                            reject(err);
                        }
                    }
                })
            })
        },
        addSourceSuccess: (source: RSSSource, batch: boolean) => {
            set(state => ({
                sources: {
                    ...state.sources,
                    [source.sid]: source
                },
            }));
            // [appReducer]
            appActions.addSourceSuccess(batch);
            // [feedReducer]
            feedActions.unhideSource(source);
            // [groupReducer]
            groupActions.addSourceSuccess(source);
        },
        updateSourceDone: (source: RSSSource) => {
            set((state) => ({ sources: { ...state.sources, [source.sid]: source } }));
            // [appReducer]
            appActions.deleteSourceGroup();
        },
        updateSource: async (source: RSSSource) => {
            let sourceCopy = { ...source };
            delete sourceCopy.unreadCount;
            delete sourceCopy.starredCount;
            const row = db.sources.createRow(sourceCopy);
            await db.sourcesDB.insertOrReplace().into(db.sources).values([row]).exec();
            get().actions.updateSourceDone(source);
        },
        updateFavicon: async (sids?: number[], force = false) => {
            const initSources = useSourceStore.getState().sources;
            if (!sids) {
                sids = Object.values(initSources)
                    .filter(s => s.iconurl === undefined)
                    .map(s => s.sid);
            } else {
                sids = sids.filter(sid => sid in initSources);
            }
            const promises = sids.map(async sid => {
                const url = initSources[sid].url;
                let favicon = (await fetchFavicon(url)) || "";
                const source = useSourceStore.getState().sources[sid];
                if (source && source.url === url && (force || source.iconurl === undefined)) {
                    source.iconurl = favicon;
                    get().actions.updateSource(source);
                }
            })
            await Promise.all(promises);
        },
        deleteSourceDone: (source: RSSSource) => {
            const state = get().sources;
            delete state[source.sid];
            set({ sources: { ...state } });
            // [appReducer]
            appActions.deleteSourceGroup();
            // [feedReducer]
            feedActions.hideSource(source);
            // [groupReducer]
            groupActions.deleteSourceDone(source);
            // [pageReducer]
            pageActions.dismissItem();
        },
        deleteSource: async (source: RSSSource, batch = false) => {
            return new Promise(async (_resolve, reject) => {
                if (!batch) {
                    appActions.saveSettings();
                }
                try {
                    await db.itemsDB.delete().from(db.items).where(db.items.source.eq(source.sid)).exec();
                    await db.sourcesDB.delete().from(db.sources).where(db.sources.sid.eq(source.sid)).exec();
                    get().actions.deleteSourceDone(source);
                    window.settings.saveGroups(useGroupStore.getState().groups);
                } catch (err) {
                    console.log(err);
                    reject(err);
                } finally {
                    if (!batch) {
                        appActions.saveSettings();
                    }
                }
            });
        },
        deleteSources: async (sources: RSSSource[]) => {
            appActions.saveSettings();
            for (let source of sources) {
                await get().actions.deleteSource(source, true);
            }
            appActions.saveSettings();
        },
        updateUnreadCounts: async () => {
            const sources: SourceState = {};
            for (let source of Object.values(useSourceStore.getState().sources)) {
                sources[source.sid] = {
                    ...source,
                    unreadCount: 0,
                }
            }
            set({ sources: await unreadCount(sources) });
        },
        updateStarredCounts: async () => {
            const sources: SourceState = {};
            for (let source of Object.values(useSourceStore.getState().sources)) {
                sources[source.sid] = {
                    ...source,
                    starredCount: 0,
                }
            }
            set({ sources: await starredCount(sources) });
        },
        addSourceRequest: () => {
            // [appReducer]
            appActions.addSourceRequest();
        },
        addSourceFailure: (err: Error, batch: boolean) => {
            // [appReducer]
            appActions.addSourceSuccess(batch);
        },
        addSource: async (url: string, name: string = null, batch = false) => {
            const app = useAppStore.getState().app;
            console.log('addSource~~', app);
            if (app.sourceInit) {
                get().actions.addSourceRequest();
                const source = new RSSSource(url, name);
                try {
                    console.log('addSource in', source);
                    const feed = await RSSSource.fetchMetaData(source);
                    const inserted = await get().actions.insertSource(source);
                    inserted.unreadCount = feed.items.length;
                    inserted.starredCount = 0;
                    get().actions.addSourceSuccess(inserted, batch);
                    window.settings.saveGroups(useGroupStore.getState().groups);
                    get().actions.updateFavicon([inserted.sid]);
                    const items = await RSSSource.checkItems(inserted, feed.items);
                    await insertItems(items);
                    return inserted.sid;
                } catch (e) {
                    get().actions.addSourceFailure(e, batch);
                    if (!batch) {
                        window.utils.showErrorBox(
                            intl.get("sources.errorAdd"),
                            String(e),
                            intl.get("context.copy"),
                        );
                    }
                    throw e;
                }
            }
            throw new Error("Sources not initialized.");
        },
        markReadDone: (item: RSSItem, type = MARK_READ) => {
            set((state) => ({
                sources: {
                    ...state.sources,
                    [item.source]: {
                        ...state.sources[item.source],
                        unreadCount: state.sources[item.source].unreadCount + (type === MARK_UNREAD ? 1 : -1)
                    }
                }
            }))
        },
        markUnreadDone: (item: RSSItem) => {
            get().actions.markReadDone(item, MARK_UNREAD);
        },
        toggleStarredDone: (item: RSSItem) => {
            set(state => ({
                sources: {
                    ...state.sources,
                    [item.source]: {
                        ...state.sources[item.source],
                        starredCount: state.sources[item.source].starredCount + (item.starred ? -1 : 1),
                    } as RSSSource
                }
            }))
        },
        toggleSourceHidden: async (source: RSSSource) => {
            const sourceCopy: RSSSource = { ...get().sources[source.sid] };
            sourceCopy.hidden = !sourceCopy.hidden;
            sourceCopy.hidden
                ? feedActions.hideSource(sourceCopy)
                : feedActions.unhideSource(sourceCopy);
            await get().actions.updateSource(sourceCopy);
        },
        markAllReadDone: (sids: number[], time: number) => {
            set(state => {
                let nextState = { ...state.sources };
                sids.forEach(sid => {
                    nextState[sid] = {
                        ...state.sources[sid],
                        unreadCount: time ? state.sources[sid].unreadCount : 0,
                    }
                })
                return { sources: nextState };
            })
        },
    },
}), { name: "source" }))

export const sourceActions = useSourceStore.getState().actions;

export const useSources = () => useSourceStore(state => state.sources);
export const useSourceActions = () => useSourceStore(state => state.actions);

export const outlineToSource = (outline: Element): [Promise<number>, string] => {
    let url = outline.getAttribute("xmlUrl");
    let name = outline.getAttribute("text") || outline.getAttribute("title");
    if (url) {
        return [useSourceStore.getState().actions.addSource(url.trim(), name, true), url];
    } else {
        return null;
    }
}

export const sourceToOutline = (source: RSSSource, xml: Document) => {
    let outline = xml.createElement("outline");
    outline.setAttribute("text", source.name);
    outline.setAttribute("title", source.name);
    outline.setAttribute("type", "rss");
    outline.setAttribute("xmlUrl", source.url);
    return outline;
}
