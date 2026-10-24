import com.jpexs.decompiler.flash.SWF;
import com.jpexs.decompiler.flash.tags.Tag;
import com.jpexs.decompiler.flash.tags.base.BoundedTag;
import com.jpexs.decompiler.flash.tags.base.CharacterTag;
import com.jpexs.decompiler.flash.types.RECT;
import java.io.BufferedInputStream;
import java.io.FileInputStream;

/** Prints "id xminTwips yminTwips xmaxTwips ymaxTwips" for the requested character ids, as FFDec exports them. */
public class Bounds {
    public static void main(String[] args) throws Exception {
        SWF swf = new SWF(new BufferedInputStream(new FileInputStream(args[0])), false);
        for (int i = 1; i < args.length; i++) {
            int id = Integer.parseInt(args[i]);
            CharacterTag tag = swf.getCharacter(id);
            if (tag instanceof BoundedTag) {
                RECT r = ((BoundedTag) tag).getRect();
                System.out.println(id + " " + r.Xmin + " " + r.Ymin + " " + r.Xmax + " " + r.Ymax);
            }
        }
    }
}
