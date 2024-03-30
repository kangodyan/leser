import React, { useState } from 'react';
import { Icon } from '@fluentui/react';
import intl from 'react-intl-universal';
import { FilterType } from '@renderer/scripts/models/feed';

export const ContentFilter = ({ switchFilter }) => {
    const [activeFilter, setActiveFilter] = useState(FilterType.Default);

    const handleClick = (filterType) => {
        switchFilter(filterType);
        setActiveFilter(filterType);
    };

    const isActiveFilter = (filterType) => {
        return activeFilter === filterType;
    }

    return (
        <div className="content-filter">
            <a
                className={`btn ${isActiveFilter(FilterType.StarredOnly) && 'selected'}`}
                onClick={() => handleClick(FilterType.StarredOnly)}
                title={intl.get("context.starredOnly")}
            >
                <Icon iconName="FavoriteStarFill" />
                {isActiveFilter(FilterType.StarredOnly) && <span>星标</span>}
            </a>
            <a
                className={`btn ${isActiveFilter(FilterType.UnreadOnly) && 'selected'}`}
                onClick={() => handleClick(FilterType.UnreadOnly)}
                title={intl.get("context.unreadOnly")}
            >
                <Icon iconName="RadioBtnOn" />
                {isActiveFilter(FilterType.UnreadOnly) && <span>未读</span>}
            </a>
            <a
                className={`btn ${isActiveFilter(FilterType.Default) && 'selected'}`}
                onClick={() => handleClick(FilterType.Default)}
                title={intl.get("allArticles")}
            >
                <Icon iconName="ClearFilter" />
                {isActiveFilter(FilterType.Default) && <span>全部</span>}
            </a>
        </div>
    );
};