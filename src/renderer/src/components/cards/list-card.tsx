import * as React from "react"
import { CardProps, bindCardEventsToProps } from "./card"
import CardInfo from "./info"
import Highlights from "./highlights"
import { ViewConfigs } from "../../schema-types"
import { SourceTextDirection } from "../../scripts/models/source"

const className = (props: CardProps) => {
    let cn = ["card", "list-card"]
    if (props.item.hidden) cn.push("hidden")
    if (props.selected) cn.push("selected")
    if (props.viewConfigs & ViewConfigs.FadeRead && props.item.hasRead)
        cn.push("read")
    if (props.source.textDir === SourceTextDirection.RTL) cn.push("rtl")
    return cn.join(" ")
}

const ListCard: React.FunctionComponent<CardProps> = props => {
    // 检查图片是否有效显示
    const [isValid, setIsValid] = React.useState(true);

    return (
        <div
            className={className(props)}
            {...bindCardEventsToProps(props)}
            data-iid={props.item._id}
            data-is-focusable
        >
            <div className="data">
                <CardInfo source={props.source} item={props.item} />
            </div>
            <div className="bottom">
                <div className="content" style={{width: (props.item.thumb && props.viewConfigs & ViewConfigs.ShowCover) ? 'calc(100% - 90px)' : '100%'}}>
                    <h3 className="title">
                        <Highlights
                            text={props.item.title}
                            filter={props.filter}
                            title
                        />
                    </h3>
                    {Boolean(props.viewConfigs & ViewConfigs.ShowSnippet) && (
                        <p className="snippet">
                            <Highlights
                                text={props.item.snippet}
                                filter={props.filter}
                            />
                        </p>
                    )}
                </div>
                {props.item.thumb && props.viewConfigs & ViewConfigs.ShowCover ? (
                    // 图片无法有效显示的话，就修改背景颜色
                    <div className={isValid ? 'cover' : 'cover coverImgExtra'}>
                        <img style={{ display : isValid ? 'block' : 'none'}} src={props.item.thumb} onError={() => setIsValid(false)} />
                    </div>
                ) : null}
            </div>
        </div>
    )
}

export default ListCard
