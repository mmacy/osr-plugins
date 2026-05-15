interface Props {
    visible: boolean;
}

export function DisconnectBanner({ visible }: Props) {
    if (!visible) return null;
    return (
        <div className="banner disconnect">
            ⚠ Disconnected from the extension. The OSR Game Client window is no longer live —
            close it and reopen with{" "}
            <code>/osr-game-client</code>.
        </div>
    );
}
