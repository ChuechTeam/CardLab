import {Container, Graphics, Rectangle} from "pixi.js";
import {GameScene} from "src/duel/game/GameScene.ts";

export class EntitySelectOverlay extends Container {
    // This one has to be in world space in order to get proper masking.
    background: Graphics
    mask: Graphics
    active = false
    
    constructor(public scene: GameScene) {
        super();
        
        this.background = new Graphics()
            .rect(-10000, -10000, 20000, 20000)
            .fill({ color: 0x000000 });
        this.background.alpha = 0.35;
        this.addChild(this.background)
        
        this.mask = new Graphics();
        this.addChild(this.mask)
        
        this.background.mask = this.mask;
        
        this.zIndex = 5000;
        this.eventMode = "none";
        this.visible = false;
    }
    
    show(entities: number[]) {
        this.visible = true;
        this.active = true;
        
        // doesn't work great yet for cards.
        
        this.mask.clear()
            .rect(-10000, -10000, 20000, 20000)
            .fill({ color: 0x000000 });
        
        for (const entityId of entities) {
            const entity = this.scene.findEntity(entityId);
            if (entity !== undefined) {
                const { width, height } = entity.getLocalBounds();
                const rect = new Rectangle(entity.x-entity.pivot.x, entity.y-entity.pivot.y, width, height);
                rect.pad(7, 7);
                this.mask.roundRect(rect.x, rect.y, rect.width, rect.height, 6)
                    .fill({ color: 0xffffff });
            }
        }
    }
    
    hide() {
        this.visible = false;
        this.active = false;
    }
}