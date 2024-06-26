import * as db from '../db';
import { create } from 'zustand'
import { AppLog, AppLogType, AppState, ContextMenuType } from '../models/app';
import { RSSItem } from '../models/item';
import { RSSSource, SourceOpenTarget } from '../models/source';
import { pageActions } from './page-store';
import { itemActions } from './item-store';
import { getCurrentLocale, importAll, setThemeDefaultFont } from '../settings';
import intl from 'react-intl-universal';
import locales from "../i18n/_locales";
import { getWindowBreakpoint, initTouchBarWithTexts, validateFavicon } from '../utils';
import { sourceActions, useSourceStore } from './source-store';
import { feedActions, useFeedStore } from './feed-store';
import { devtools } from 'zustand/middleware';
import { ALL } from '../models/feed';
import { produce } from 'immer';

type AppStore = {
    app: AppState;
    actions: {
        initSourcesSuccess: () => void;
        initFeedsSuccess: () => void;
        fetchItemsRequest: (fetchCount: number) => void;
        fetchItemsFailure: (errSource: RSSSource, err: Error) => void;
        fetchItemsIntermediate: () => void;
        fetchItemsSuccess: (items: RSSItem[]) => void;
        selectAllArticles: () => void;
        initIntlDone: (locale: string) => void;
        initIntl: () => Promise<void>;
        initApp: () => void;
        addSourceRequest: () => void;
        addSourceSuccess: (batch: boolean) => void;
        saveSettings: () => void;
        pushNotification: (item: RSSItem) => void;
        setupAutoFetch: () => void;
        openTextMenu: (position: [number, number], text: string, url?: string) => void;
        openItemMenu: (feedId: string, item: RSSItem, event: MouseEvent) => void;
        openViewMenu: () => void;
        openMarkAllMenu: () => void;
        toggleLogMenu: () => void;
        toggleSettings: (open?: boolean, sids?: Array<number>) => void;
        deleteArticles: (days: number) => Promise<void>;
        importAll: () => Promise<void>;
        updateSourceIcon: (source: RSSSource, iconUrl: string) => void;
        deleteSourceGroup: () => void;
        syncWithServiceRequest: () => void;
        syncWithServiceSuccess: () => void;
        syncWithServiceFailure: (err: Error) => void;
        openImageMenu: (position: [number, number]) => void;
        closeContextMenu: () => void;
        freeMemory: () => void;
        exitSettings: () => Promise<void>;
        selectSources: (menuKey: string, title: string) => void;
        openGroupMenu: (sids: number[], event: React.MouseEvent) => void;
        toggleMenu: (display?: boolean) => void;
    }
}

let fetchTimeout: NodeJS.Timeout;

export const useAppStore = create<AppStore>()(devtools((set, get) => ({
    app: new AppState(),
    actions: {
        initSourcesSuccess: () => {
            set((state) => ({ app: { ...state.app, sourceInit: true } }))
        },
        initFeedsSuccess: () => {
            set((state) => ({ app: { ...state.app, feedInit: true } }))
        },
        fetchItemsRequest: (fetchCount: number) => {
            set((state) => ({
                app: {
                    ...state.app,
                    fetchingItems: true,
                    fetchingProgress: 0,
                    fetchingTotal: fetchCount
                }
            }))
        },
        fetchItemsFailure: (errSource: RSSSource, err: Error) => {
            set((state) =>({
                app: {
                    ...state.app,
                    logMenu: {
                        ...state.app.logMenu,
                        notify: !state.app.logMenu.display,
                        logs: [
                            ...state.app.logMenu.logs,
                            new AppLog(
                                AppLogType.Failure,
                                intl.get("log.fetchFailure", {
                                    name: errSource.name
                                }),
                                String(err)
                            )
                        ]
                    }
                } 
            }))
        },
        fetchItemsIntermediate: () => {
            set((state) => ({ app: { ...state.app, fetchingProgress: state.app.fetchingProgress + 1 } }))
        },
        fetchItemsSuccess: (items: RSSItem[]) => {
            set((state) => ({
                app: {
                    ...state.app,
                    fetchingItems: false,
                    fetchingTotal: 0,
                    logMenu:
                        items.length === 0
                        ? state.app.logMenu
                        : {
                            ...state.app.logMenu,
                            logs: [
                                ...state.app.logMenu.logs,
                                new AppLog(
                                    AppLogType.Info,
                                    intl.get("log.fetchSuccess", {
                                        count: items.length
                                    })
                                )
                            ]
                        }
                }
            }))
        },
        selectAllArticles: () => {
            set((state) => ({
                app: {
                    ...state.app,
                    menu: state.app.menu && getWindowBreakpoint(),
                    menuKey: ALL,
                    title: intl.get("allArticles")
                }
            }))
        },
        initIntlDone: (locale: string) => {
            document.documentElement.lang = locale;
            setThemeDefaultFont(locale);
            set((state) => ({ app: { ...state.app, locale: locale } }));
        },
        initIntl: async () => {
            let locale = getCurrentLocale();
            return intl
                .init({
                    currentLocale: locale,
                    locales: locales,
                    fallbackLocale: "en-US",
                })
                .then(() => {
                    get().actions.initIntlDone(locale);
                })
        },
        initApp: () => {
            console.log('~~initApp~~');
            document.body.classList.add(window.utils.platform);
            get().actions.initIntl()
                .then(async () => {
                    if (window.utils.platform === "darwin") {
                        initTouchBarWithTexts();
                    }
                    await sourceActions.initSources();
                })
                .then(() => {
                    feedActions.initFeeds();
                })
                .then(async () => {
                    pageActions.selectAllArticles();
                    await itemActions.fetchItems();
                })
                .then(() => {
                    sourceActions.updateFavicon();
                }).catch(error => {
                    console.log('An error occurred:', error);
                });
        },
        addSourceRequest: () => {
            set(state => ({
                app: {
                    ...state.app,
                    fetchingItems: true,
                    settings: {
                        ...state.app.settings,
                        changed: true,
                        saving: true
                    }
                }
            }));
        },
        addSourceSuccess: (batch: boolean) => {
            set(state => ({
                app: {
                    ...state.app,
                    fetchingItems: state.app.fetchingTotal !== 0,
                    settings: {
                        ...state.app.settings,
                        saving: batch
                    }
                }
            }));
        },
        saveSettings: () => {
            set(state => ({
                app: {
                    ...state.app,
                    settings: {
                        ...state.app.settings,
                        display: true,
                        changed: true,
                        saving: !state.app.settings.saving,
                    }
                },
            }));
        },
        pushNotification: (item: RSSItem) => {
            const sourcesZ = useSourceStore.getState().sources;
            const sourceName = sourcesZ[item.source].name;
            if (!window.utils.isFocused()) {
                const options = { body: sourceName } as any;
                if (item.thumb) options.icon = item.thumb;
                const notification = new Notification(item.title, options);
                notification.onclick = () => {
                    const state = { sources: sourcesZ, app: useAppStore.getState().app };
                    if (state.sources[item.source].openTarget === SourceOpenTarget.External) {
                        window.utils.openExternal(item.link);
                    } else if (!state.app.settings.display) {
                        window.utils.focus();
                        pageActions.showItemFromId(item._id);
                    }
                }
            }
            set(state => ({
                app: {
                    ...state.app,
                    logMenu:  {
                        ...state.app.logMenu,
                        notify: true,
                        logs: [
                            ...state.app.logMenu.logs,
                            new AppLog(
                                AppLogType.Article,
                                item.title,
                                sourceName,
                                item._id
                            ),
                        ],
                    }
                } 
            }));
        },
        setupAutoFetch: () => {
            clearTimeout(fetchTimeout);
            const setupTimeout = (interval?: number) => {
                if (!interval) {
                    interval = window.settings.getFetchInterval();
                } else {
                    fetchTimeout = setTimeout(() => {
                        let app = get().app;
                        if (!app.settings.display) {
                            if (!app.fetchingItems) {
                                itemActions.fetchItems(true);
                            }
                        } else {
                            setupTimeout(1);
                        }
                    }, interval * 60000);
                }
            }
            setupTimeout();
        },
        openTextMenu: (position: [number, number], text: string, url: string = null) => {
            set({
                app: {
                    ...get().app,
                    contextMenu: {
                        type: ContextMenuType.Text,
                        position: position,
                        target: [text, url],
                    }
                } 
            });
        },
        openItemMenu: (feedId: string, item: RSSItem, event: MouseEvent) => {
            set(state => ({
                app: {
                    ...state.app,
                    contextMenu: {
                        type: ContextMenuType.Item,
                        event: event,
                        target: [item, feedId]
                    }
                }
            }));
        },
        openViewMenu: () => {
            set(state => ({
                app: {
                    ...state.app,
                    contextMenu: {
                        type: state.app.contextMenu.type === ContextMenuType.View
                            ? ContextMenuType.Hidden
                            : ContextMenuType.View,
                        event: "#view-toggle"
                    },
                }
            }))
        },
        openMarkAllMenu: () => {
            set(state => ({
                app: {
                    ...state.app,
                    contextMenu: {
                        type:
                            state.app.contextMenu.type === ContextMenuType.MarkRead
                                ? ContextMenuType.Hidden
                                : ContextMenuType.MarkRead,
                        event: "#mark-all-toggle",
                    },
                }
            }))
        },
        toggleLogMenu: () => {
            set(state => ({
                app: {
                    ...state.app,
                    logMenu: {
                        ...state.app.logMenu,
                        display: !state.app.logMenu.display,
                        notify: false
                    }
                }
            }))
        },
        toggleSettings: (open = true, sids = new Array<number>()) => {
            set(state => ({
                app: {
                    ...state.app,
                    settings: {
                        display: open,
                        changed: false,
                        sids: sids,
                        saving: false,
                    },
                }
            }));
        },
        deleteArticles: async (days: number) => {
            get().actions.saveSettings();
            let date = new Date();
            date.setTime(date.getTime() - days * 86400000);
            await db.itemsDB
                .delete()
                .from(db.items)
                .where(db.items.date.lt(date))
                .exec();
            await sourceActions.updateUnreadCounts();
            await sourceActions.updateStarredCounts();
            get().actions.saveSettings();
        },
        importAll: async () => {
            get().actions.saveSettings();
            let cancelled = await importAll();
            if (cancelled) {
                get().actions.saveSettings();
            }
        },
        updateSourceIcon: async (source: RSSSource, iconUrl: string) => {
            get().actions.saveSettings();
            if (await validateFavicon(iconUrl)) {
                sourceActions.updateSource({ ...source, iconurl: iconUrl });
            } else {
                window.utils.showErrorBox(intl.get("sources.badIcon"), "");
            }
            get().actions.saveSettings();
        },
        deleteSourceGroup: () => {
            set(produce((draft: AppStore) => {
                draft.app.settings.changed = true;
            }));
        },
        syncWithServiceRequest: () => {
            set(produce((draft: AppStore) => {
                draft.app.syncing = true;
            }));
        },
        syncWithServiceSuccess: () => {
            set(produce((draft: AppStore) => {
                draft.app.syncing = false;
            }));
        },
        syncWithServiceFailure: (err: Error) => {
            set(produce((draft: AppStore) => {
                draft.app.syncing = false;
                draft.app.logMenu.notify = true;
                draft.app.logMenu.logs = [
                    ...draft.app.logMenu.logs,
                    new AppLog(
                        AppLogType.Failure,
                        intl.get("log.syncFailure"),
                        String(err)
                    )
                ];
            }));
        },
        openImageMenu: (position: [number, number]) => {
            set(state => ({
                app: {
                    ...state.app,
                    contextMenu: {
                        type: ContextMenuType.Image,
                        position: position
                    }
                }
            }))
        },
        closeContextMenu: () => {
            if (get().app.contextMenu.type !== ContextMenuType.Hidden) {
                set(state => ({
                    app: {
                        ...state.app,
                        contextMenu: {
                            type: ContextMenuType.Hidden,
                        },
                    }
                }))
            }
        },
        freeMemory: () => {
            const iids = new Set<number>();
            for (let feed of Object.values(useFeedStore.getState().feeds)) {
                if (feed.loaded) {
                    feed.iids.forEach(iids.add, iids);
                }
            }
            itemActions.freeMemory(iids);
        },
        exitSettings: async () => {
            if (!get().app.settings.saving) {
                if (get().app.settings.changed) {
                    get().actions.saveSettings();
                    pageActions.selectAllArticles(true);
                    await feedActions.initFeeds(true);
                    get().actions.toggleSettings(false);
                    get().actions.freeMemory();
                } else {
                    get().actions.toggleSettings(false);
                }
            }
        },
        selectSources: (menuKey: string, title: string) => {
            set(state => ({
                app: {
                    ...state.app,
                    menu: state.app.menu && getWindowBreakpoint(),
                    menuKey: menuKey,
                    title: title,
                }
            }));
        },
        openGroupMenu: (sids, event) => {
            set(state => ({
                app: {
                    ...state.app,
                    contextMenu: {
                        type: ContextMenuType.Group,
                        event: event,
                        target: sids,
                    },
                }
            }));
        },
        toggleMenu: (display?) => {
            set(produce((draft: AppStore) => {
                draft.app.menu = (display !== undefined) ? display : !draft.app.menu;
            }));
            window.settings.setDefaultMenu(get().app.menu);
        },
    }
}), { name: "app" }))

export const appActions = useAppStore.getState().actions;

export const useApp = () => useAppStore(state => state.app);
export const useAppActions = () => useAppStore(state => state.actions);

export const useAppMenuOn = () => useAppStore(state => state.app.menu);
export const useAppLocale = () => useAppStore(state => state.app.locale);
export const useAppStatusByMenu = () => useAppStore(state => state.app.sourceInit && !state.app.settings.display);
export const useAppSettingsSids = () => useAppStore(state => state.app.settings.sids);
export const useAppSettingsDisplay = () => useAppStore(state => state.app.settings.display);
export const useAppContextMenu = () => useAppStore(state => state.app.contextMenu);
export const useAppContextMenuOn = () => useAppStore(state => state.app.contextMenu.type != ContextMenuType.Hidden);
export const useAppLogMenu = () => useAppStore(state => state.app.logMenu);
export const useAppSettingsSaving = () => useAppStore(state => state.app.settings.saving);
export const useAppSettingsBlocked = () => useAppStore(state => 
    !state.app.sourceInit ||
    state.app.syncing ||
    state.app.fetchingItems ||
    state.app.settings.saving
);
