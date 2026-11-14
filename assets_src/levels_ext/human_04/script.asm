; human_04: параметры и код задания дополнительного уровня 1999 г. (#79C0..#7E0F, 1104 байта; продолжение блока - герои, карта, экран)
; собирается sjasmplus (task.bin - из task.txt, см. tools/levels.py); подробности - docs/FORMATS.md

KBUILD	EQU	#7D00
LEVDAT	EQU	#79C0
	ORG	LEVDAT

isRUNL	DEFB	#C9	; #C9 - обычный уровень
hTOWER	DEFB	2	; макс. число типов вооружения (1-4)
hARC	DEFB	0
hHORSE	DEFB	0
hSHILD	DEFB	0
hBLADE	DEFB	0
hmaxC	DEFB	1	; число исследуемых заклинаний священника
hmaxW	DEFB	1	; то же волшебника
hmaxB1	DEFB	2	; макс. число стандартных зданий
hmaxB2	DEFB	1	; макс. число доп. зданий
hWALL	DEFB	0	; 0/17 - можно/нельзя строить стены
kTOWER	DEFB	2	; параметры компьютера
kARC	DEFB	0
kHORSE	DEFB	0
kSHILD	DEFB	0
kBLADE	DEFB	0
kmaxC	DEFB	1
kmaxW	DEFB	0
levMAX	DEFB	3	; макс. народу в группе врага
levDEL	DEFB	#25	; средняя задержка между сборами врага
lev1ST	DEFB	#37	; начальная задержка первого сбора
levTYP	DEFB	0	; тип уровня (0 - обычный)
COLOR	DEFB	#30	; цвет поля
MASTER	DEFB	0	; кто играет: 0 люди, 1 кунги
LEVEL	DEFB	4	; номер уровня
MONEY	DEFB	0,0,0,5,0,0	; деньги (6 цифр)
WOOD	DEFB	0,0,1,0,0,0	; лес (6 цифр)
TASK_M	INCBIN	"task.bin"	; задание: 3 строки (см. task.txt)
LEVRES	DEFB	0,0,0,#2B,0,0,#7F	; текущее время прохождения
fsLAND	DEFB	1	; ландшафт 1-4
fsMUS	DEFB	3	; мелодия 0-7
SEL_T	DEFB	0
SEL_N	DEFB	0,0,0,0,0,0
sel_en	DEFB	#FF
sel_ti	DEFB	0
LED	DEFB	0,0,0,0,0,0
_msg	DEFB	0
pTX_AD	DEFW	#F0D7
TX_AD	DEFW	#F0D7
pTXdel	DEFB	0
isPLAT	DEFB	0
szPLAT	DEFB	0
bcPLAT	DEFW	#0000
adPLAT	DEFW	#0000
waPLAT	DEFB	0
onPAUS	DEFB	4
NOTA	DEFW	#7A4C
se	DEFW	#FFFF
levSND	DEFB	0
sIY56	DEFW	#0000
priv_S	DEFB	0
NOTA2	DEFW	#7A4C
priv_2	DEFB	0
pntX	DEFB	#2F
pntY	DEFB	#21
pntNUM	DEFB	#FF
pntDEL	DEFB	#36
pntTAR	DEFB	#8A
pntUNI	DEFB	0
pntEN	DEFB	2,2,1,0,0,0
pntMAN	DEFB	0
END_1	DEFB	0	; 0/1/2 - нет/нет врагов/нет людей
END_2	DEFB	0
TheEND	DEFB	0	; 0/1/2 - нет/победа людей/победа врагов (ставит _cLOOP)
dummy	DEFB	0,0,0,0,0,0	; резерв

;------------ процедуры: pcLOOP - каждый кадр, pcINI - при старте ------------
pcLOOP:

        jr _cLOOP                     ; 7A6B  1801

pcINI:
        ret                           ; 7A6D  c9

_cLOOP:
        ld ix,KBUILD                  ; 7A6E  dd21007d
        ld de,$0008                   ; 7A72  110800
        ld b,$20                      ; 7A75  0620
L_7A77:
        ld a,(ix+$02)                 ; 7A77  dd7e02
        cp $01                        ; 7A7A  fe01
        jr z,L_7A8D                   ; 7A7C  280f
        cp $0b                        ; 7A7E  fe0b
        jr z,L_7A8D                   ; 7A80  280b
L_7A82:
        add ix,de                     ; 7A82  dd19
        djnz L_7A77                   ; 7A84  10f1
        ld a,(END_1)                  ; 7A86  3a627a
L_7A89:
        ld (TheEND),a                 ; 7A89  32647a
        ret                           ; 7A8C  c9

L_7A8D:
        ld a,(ix+$03)                 ; 7A8D  dd7e03
        or a                          ; 7A90  b7
        jr nz,L_7A82                  ; 7A91  20ef
        ld a,$01                      ; 7A93  3e01
        jr L_7A89                     ; 7A95  18f2

	DEFS	#7AA0-$,#27	; заполнитель до BULL (код задания - не более 53 байт: #7A6B..#7A9F)
	DEFS	#7E00-$	; рабочие массивы BULL, MINE, HBUILD, KBUILD, BUF512 (в файле нули)

datMIN	DEFW	260,120,139,77,183,65535,65535,65535	; золото 8 шахт (/100)
datHER		; здесь начинаются герои (496 байт), карта (4096) и экран (6912) - в файлах heroes.txt, map.csv, screen.png
