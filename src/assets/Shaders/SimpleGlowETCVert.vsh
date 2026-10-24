attribute vec4 a_position;
attribute vec2 a_texCoord;

uniform mat4 u_MVPMatrix;

#ifdef GL_ES
varying mediump vec2 v_texCoord;
varying mediump vec2 v_alphaTexCoord;
varying mediump vec4 v_fragmentColor;  
#else
varying vec2 v_texCoord;
varying vec2 v_alphaTexCoord; 
#endif

void main()
{
    gl_Position = u_MVPMatrix * a_position;
    v_texCoord = a_texCoord * vec2(1.0, 0.5);
    v_alphaTexCoord = v_texCoord + vec2(0.0, 0.5);
}
